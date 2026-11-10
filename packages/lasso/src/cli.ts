import { spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { createInbox, defaultInboxDir, formatEntry } from './server/inbox'
import { startProxy } from './server/proxy'

const HELP = `Clevon Lasso — 보고 있는 화면에 바로 피드백을 남기고 코딩 에이전트 세션이 받아 고친다.

사용법
  lasso <포트>            개발 서버(<포트>) 앞에 피드백 도구를 얹은 중계 서버를 연다 (기본 <포트>+100)
    --listen <포트>       중계 서버 포트를 직접 정한다
  lasso start <포트>      중계 서버를 백그라운드로 띄우고 바로 끝난다 (로그·pid 는 수신함 폴더)
  lasso stop              start 로 띄운 중계 서버를 내린다
  lasso watch             아직 안 넘긴 피드백부터 한 건씩 출력하고 새 피드백을 기다린다
  lasso next              안 넘긴 피드백이 있으면 출력하고, 없으면 올 때까지 기다렸다 끝난다
    --timeout <초>        이만큼 기다려도 없으면 끝낸다 (기본 100)
  lasso idle              마지막 활동(화면 열기·피드백) 뒤 몇 분 지났는지 출력한다
  lasso wait              사용자가 돌아올 때(화면을 열거나 피드백을 보낼 때)까지 기다렸다 끝난다
  lasso path              이 프로젝트의 수신함 폴더를 출력한다

공통
  --dir <폴더>            수신함 폴더 (기본: ~/.clevon-lasso/<프로젝트이름>-<해시>)
  --project <폴더>        어느 프로젝트의 수신함인지 (기본: 현재 폴더)`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    listen: { type: 'string' },
    dir: { type: 'string' },
    project: { type: 'string' },
    timeout: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

const inbox = createInbox(values.dir ? path.resolve(values.dir) : defaultInboxDir(values.project))
const command = positionals[0]

async function watch() {
  const tick = async () => {
    for (const entry of await inbox.takeUnread()) process.stdout.write(`${formatEntry(entry)}\n`)
  }
  await tick()
  setInterval(() => void tick().catch((error) => console.error(error)), 700)
}

async function next() {
  const deadline = Date.now() + (Number(values.timeout) || 100) * 1000
  for (;;) {
    const entries = await inbox.takeUnread()
    if (entries.length) {
      for (const entry of entries) process.stdout.write(`${formatEntry(entry)}\n`)
      return
    }
    if (Date.now() >= deadline) break
    await new Promise((r) => setTimeout(r, 700))
  }
  const last = await inbox.lastActivity()
  const minutes = last === null ? 0 : Math.floor((Date.now() - last) / 60_000)
  console.log(`새 피드백 없음 · 마지막 활동 ${minutes}분 전`)
}

const pidFile = path.join(inbox.dir, 'proxy.pid')

function start(target: string) {
  mkdirSync(inbox.dir, { recursive: true })
  const log = openSync(path.join(inbox.dir, 'proxy.log'), 'a')
  const args = [fileURLToPath(import.meta.url), target, '--dir', inbox.dir]
  if (values.listen) args.push('--listen', values.listen)
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', log, log] })
  child.unref()
  writeFileSync(pidFile, String(child.pid))
  const listen = values.listen ? Number(values.listen) : Number(target) + 100
  console.log(`Lasso 중계 서버: http://localhost:${listen}  (원래 서버 http://localhost:${target})`)
  console.log(`로그: ${path.join(inbox.dir, 'proxy.log')}`)
}

function stop() {
  let pid: number
  try {
    pid = Number(readFileSync(pidFile, 'utf8'))
  } catch {
    return void console.log('start 로 띄운 중계 서버가 없다')
  }
  try {
    process.kill(pid)
    console.log(`중계 서버를 내렸다 (pid ${pid})`)
  } catch {
    console.log('중계 서버가 이미 꺼져 있다')
  }
  rmSync(pidFile, { force: true })
}

async function idle() {
  const last = await inbox.lastActivity()
  console.log(last === null ? 0 : Math.floor((Date.now() - last) / 60_000))
}

async function wait() {
  const since = Date.now()
  for (;;) {
    if (await inbox.hasUnread()) return void console.log('사용자가 돌아옴: 새 피드백이 있다')
    const last = await inbox.lastActivity()
    if (last !== null && last > since) return void console.log('사용자가 돌아옴: 화면을 열었다')
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function proxy(target: number) {
  const listen = values.listen ? Number(values.listen) : target + 100
  const here = path.dirname(fileURLToPath(import.meta.url))
  const clientJs = () => readFileSync(path.join(here, 'client.js'), 'utf8')
  await startProxy({ target, listen, inbox, clientJs })
  await inbox.touch()
  console.log(`Lasso 중계 서버: http://localhost:${listen}  (원래 서버 http://localhost:${target})`)
  console.log(`수신함: ${inbox.dir}`)
}

if (values.help || !command || command === 'help') {
  console.log(HELP)
} else if (command === 'path') {
  console.log(inbox.dir)
} else if (command === 'idle') {
  await idle()
} else if (command === 'wait') {
  await wait()
} else if (command === 'watch') {
  await watch()
} else if (command === 'next') {
  await next()
} else if (command === 'start' && /^\d+$/.test(positionals[1] ?? '')) {
  start(positionals[1]!)
} else if (command === 'stop') {
  stop()
} else if (/^\d+$/.test(command)) {
  await proxy(Number(command))
} else {
  console.error(`알 수 없는 명령: ${command}\n\n${HELP}`)
  process.exit(1)
}
