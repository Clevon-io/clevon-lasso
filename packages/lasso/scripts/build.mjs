import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = (name) => path.join(root, 'node_modules/.bin', name)
const cssOut = path.join(root, 'build/lasso.css')

rmSync(path.join(root, 'dist'), { recursive: true, force: true })
execFileSync(bin('tailwindcss'), ['-i', 'src/ui/styles.css', '-o', cssOut, '--minify'], { cwd: root, stdio: 'inherit' })

const inlineCss = {
  name: 'inline-css',
  setup(b) {
    b.onLoad({ filter: /styles\.css$/ }, () => ({ contents: readFileSync(cssOut, 'utf8'), loader: 'text' }))
  },
}

const deps = Object.keys(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies)
const common = { absWorkingDir: root, bundle: true, plugins: [inlineCss], logLevel: 'info', jsx: 'automatic' }

await Promise.all([
  build({ ...common, entryPoints: ['src/index.tsx'], outfile: 'dist/index.js', format: 'esm', platform: 'browser', external: deps }),
  build({
    ...common,
    entryPoints: ['src/client.ts'],
    outfile: 'dist/client.js',
    format: 'iife',
    platform: 'browser',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  }),
  build({ ...common, entryPoints: ['src/server/index.ts'], outfile: 'dist/server.js', format: 'esm', platform: 'node' }),
  build({
    ...common,
    entryPoints: ['src/cli.ts'],
    outfile: 'dist/cli.js',
    format: 'esm',
    platform: 'node',
    banner: { js: '#!/usr/bin/env node' },
  }),
])

execFileSync(bin('tsc'), ['--emitDeclarationOnly', '--declaration', '--noEmit', 'false'], { cwd: root, stdio: 'inherit' })
