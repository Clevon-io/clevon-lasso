import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { createInbox, defaultInboxDir, formatEntry } from './server/inbox'
import { startProxy } from './server/proxy'

const HELP = `Clevon Lasso — 보고 있는 화면에 바로 피드백을 남기고 Claude Code 세션이 받아 고친다.

사용법
  lasso <포트>            개발 서버(<포트>) 앞에 피드백 도구를 얹은 중계 서버를 연다 (기본 <포트>+100)
    --listen <포트>       중계 서버 포트를 직접 정한다
  lasso watch             아직 안 넘긴 피드백부터 한 건씩 출력하고 새 피드백을 기다린다
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
} else if (/^\d+$/.test(command)) {
  await proxy(Number(command))
} else {
  console.error(`알 수 없는 명령: ${command}\n\n${HELP}`)
  process.exit(1)
}
