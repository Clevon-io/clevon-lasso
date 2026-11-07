import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'

import type { LassoPayload } from '../core/payload'

export interface InboxEntry {
  id: string
  at: string
  page: string | null
  url: string | null
  viewport: { width: number; height: number } | null
  /** 저장된 이미지 파일의 절대 경로 */
  images: string[]
  message: string
}

const MAX_BODY = 50 * 1024 * 1024

/** 프로젝트 폴더마다 홈 아래 따로 둔다. 프로젝트 안에는 아무것도 만들지 않는다. */
export function defaultInboxDir(projectDir = process.cwd()) {
  const abs = path.resolve(projectDir)
  const hash = createHash('sha1').update(abs).digest('hex').slice(0, 6)
  return path.join(homedir(), '.clevon-lasso', `${path.basename(abs)}-${hash}`)
}

export function createInbox(dir: string) {
  const file = path.join(dir, 'inbox.jsonl')
  const imagesDir = path.join(dir, 'images')
  const cursorFile = path.join(dir, 'cursor')

  async function append(payload: Partial<LassoPayload>): Promise<InboxEntry> {
    if (typeof payload.message !== 'string' || !payload.message.trim()) throw new Error('message required')
    const id = `fb-${Date.now().toString(36)}`
    await mkdir(imagesDir, { recursive: true })
    const urls = Array.isArray(payload.images) ? payload.images.filter((v) => typeof v === 'string') : []
    const images: string[] = []
    for (const [i, dataUrl] of urls.entries()) {
      const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl)
      if (!match) continue
      const out = path.join(imagesDir, `${id}-${i + 1}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`)
      await writeFile(out, Buffer.from(match[2]!, 'base64'))
      images.push(out)
    }
    const entry: InboxEntry = {
      id,
      at: new Date().toISOString(),
      page: payload.page ?? null,
      url: payload.url ?? null,
      viewport: payload.viewport ?? null,
      images,
      message: payload.message,
    }
    await appendFile(file, `${JSON.stringify(entry)}\n`)
    return entry
  }

  function readAll(): InboxEntry[] {
    if (!existsSync(file)) return []
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as InboxEntry)
  }

  async function readCursor() {
    const raw = await readFile(cursorFile, 'utf8').catch(() => '0')
    return Number.parseInt(raw, 10) || 0
  }

  /** 아직 넘겨주지 않은 항목을 돌려주고 읽음으로 표시한다. */
  async function takeUnread(): Promise<InboxEntry[]> {
    const all = readAll()
    const cursor = await readCursor()
    if (all.length <= cursor) return []
    await mkdir(dir, { recursive: true })
    await writeFile(cursorFile, String(all.length))
    return all.slice(cursor)
  }

  return { dir, file, append, readAll, takeUnread }
}

export type Inbox = ReturnType<typeof createInbox>

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Node http 서버에 붙이는 수신 처리. 처리했으면 true. */
export async function handleFeedbackRequest(req: IncomingMessage, res: ServerResponse, inbox: Inbox) {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return true
  }
  if (req.method !== 'POST') {
    res.writeHead(405).end()
    return true
  }
  try {
    const entry = await inbox.append(JSON.parse(await readBody(req)) as Partial<LassoPayload>)
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: entry.id }))
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(error) }))
  }
  return true
}

export function formatEntry(entry: InboxEntry) {
  const when = new Date(entry.at).toLocaleString('ko-KR', { hour12: false })
  const size = entry.viewport ? ` (${entry.viewport.width}×${entry.viewport.height})` : ''
  return [
    `── Lasso 피드백 ${entry.id} · ${when} · ${entry.url ?? entry.page ?? ''}${size}`,
    entry.message,
    entry.images.length ? `이미지: ${entry.images.join(' ')}` : '이미지: 없음',
    '',
  ].join('\n')
}
