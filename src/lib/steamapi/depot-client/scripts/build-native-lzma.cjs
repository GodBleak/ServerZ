#!/usr/bin/env node
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const source = path.join(root, "native", "steam_lzma.c")

const platform = process.platform
const arch = process.arch
const target = `${platform}-${arch}`
const outDir = path.join(root, "native", target)

const ext = platform === "darwin" ? "dylib" : platform === "win32" ? "dll" : "so"
const out = path.join(outDir, platform === "win32" ? "steam_lzma.dll" : `libsteam_lzma.${ext}`)

fs.mkdirSync(outDir, { recursive: true })

const cc = process.env.CC || (platform === "win32" ? "cc" : "cc")
const common = ["-O3", "-fPIC", "-shared", source, "-o", out]

let args
if (platform === "darwin") {
  args = [...common, "-llzma"]
} else if (platform === "linux") {
  const pkg = spawnSync("pkg-config", ["--cflags", "--libs", "liblzma"], { encoding: "utf8" })
  const pkgArgs = pkg.status === 0 ? pkg.stdout.trim().split(/\s+/).filter(Boolean) : ["-llzma"]
  args = [...common, ...pkgArgs]
} else {
  args = [...common, "-llzma"]
}

console.log(`[depot-client] building ${out}`)
console.log(`${cc} ${args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg)).join(" ")}`)

const result = spawnSync(cc, args, { stdio: "inherit" })
if (result.status !== 0) process.exit(result.status ?? 1)

console.log(`[depot-client] built ${path.relative(root, out)}`)
