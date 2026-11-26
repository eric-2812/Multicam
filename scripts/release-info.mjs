// Works out the next release from package.json and CHANGELOG.md, for the release workflow:
//   tag   v0.2.0-beta
//   name  Cortiva beta 0.2
//   notes the CHANGELOG section for this version, plus download instructions.
// Fails if the CHANGELOG has no section for the version, so every release says what changed.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
// `node scripts/release-info.mjs 0.3.0-beta` writes the notes of an older version (to refresh its release).
const version = process.argv[2] || pkg.version
const m = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+))?$/.exec(version)
if (!m) throw new Error(`package.json version "${version}" is not like 0.2.0-beta`)
const [, major, minor, patch, pre] = m
const short = `${major}.${minor}${patch !== '0' ? `.${patch}` : ''}`
const name = `${pkg.productName}${pre ? ` ${pre}` : ''} ${short}`
const tag = `v${version}`

const log = readFileSync('CHANGELOG.md', 'utf8')
const lines = log.split('\n')
const start = lines.findIndex((l) => l.startsWith('## ') && l.slice(3).trim().split(/\s/)[0] === version)
if (start < 0) throw new Error(`CHANGELOG.md has no "## ${version}" section — write what changed before releasing`)
let end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
if (end < 0) end = lines.length
const changes = lines.slice(start + 1, end).join('\n').trim()
if (!changes) throw new Error(`The CHANGELOG.md section for ${version} is empty`)

const notes = `${changes}

### Download
- \`${pkg.productName}-Setup-${version}.exe\` — installer (Start menu shortcut, uninstall from Settings).
- \`${pkg.productName}-${version}-portable.exe\` — a single file, nothing to install.

Windows SmartScreen may say "Windows protected your PC" because the app isn't code-signed yet: click **More info → Run anyway**.

[Code signing policy](https://github.com/eric-2812/cortiva#code-signing-policy) · [Privacy](https://github.com/eric-2812/cortiva#privacy) · License: GPL v3
`
writeFileSync('release-notes.md', notes)
const out = `tag=${tag}\nname=${name}\n`
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out)
process.stdout.write(out)
