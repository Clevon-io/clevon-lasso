import { copyFileSync, chmodSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* 플러그인은 빌드 없이 바로 돌아야 하므로 빌드 결과를 스킬 폴더에 넣어 함께 커밋한다. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'packages/lasso/dist')
const bin = path.join(root, 'plugins/lasso/skills/lasso/bin')
copyFileSync(path.join(dist, 'cli.js'), path.join(bin, 'lasso.mjs'))
copyFileSync(path.join(dist, 'client.js'), path.join(bin, 'client.js'))
chmodSync(path.join(bin, 'lasso.mjs'), 0o755)
console.log(`플러그인 갱신: ${path.relative(root, bin)}`)
