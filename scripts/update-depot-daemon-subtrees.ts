#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sharedRoot = resolve(root, 'src/lib/depot-daemon-shared')

function git(args: string[], options: { allowFailure?: boolean; silent?: boolean } = {}): string {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe']
  })

  if (!options.silent) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }

  if (result.status !== 0 && !options.allowFailure) throw new Error(`git ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`)
  return result.stdout
}

function replaceInFile(path: string, replacements: Array<readonly [string, string]>): void {
  let content = readFileSync(path, 'utf8')
  for (const [from, to] of replacements) content = content.replaceAll(from, to)
  writeFileSync(path, content)
}

function ensureDepotDaemonRemote(): void {
  const existing = git(['remote', 'get-url', 'depot-daemon'], { allowFailure: true, silent: true }).trim()
  if (!existing) git(['remote', 'add', 'depot-daemon', '../depot-daemon'])
}

function applyServerZCompatibilityPatch(): void {
  for (const file of ['depot-client.config.schema.ts', 'depot-daemon.config.schema.ts'])
    replaceInFile(resolve(sharedRoot, file), [['@feathersjs/typebox', '@sinclair/typebox']])

  replaceInFile(resolve(sharedRoot, 'depot-daemon-api.ts'), [['../depot-client/index.js', '../steamapi/depot-client/src/index.js']])
}

ensureDepotDaemonRemote()
git(['fetch', 'depot-daemon', 'depot-client-split', 'depot-daemon-shared-split'])
git(['subtree', 'pull', '--prefix=src/lib/steamapi/depot-client/src', 'depot-daemon', 'depot-client-split', '--squash'])
git(['subtree', 'pull', '--prefix=src/lib/depot-daemon-shared', 'depot-daemon', 'depot-daemon-shared-split', '--squash'])
applyServerZCompatibilityPatch()

console.log('Updated depot-daemon subtrees. Review and commit any ServerZ compatibility changes.')
