import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The WASM runtime served from public/vision/wasm must come from the same
// @mediapipe/tasks-vision release as the JavaScript API, or the two can disagree
// at runtime. `npm run vision:sync` copies the installed runtime into public/;
// `npm run vision:check` (run in CI) fails when the copies have drifted, e.g.
// after a dependency bump that only touched package.json.
const source = 'node_modules/@mediapipe/tasks-vision/wasm'
const target = 'public/vision/wasm'
const checkOnly = process.argv.includes('--check')

if (!existsSync(source)) {
  console.error(`Missing ${source}. Run npm ci first.`)
  process.exit(1)
}

const { version } = JSON.parse(readFileSync('node_modules/@mediapipe/tasks-vision/package.json', 'utf8'))
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const files = readdirSync(source).filter(name => /\.(js|wasm)$/.test(name))
const stale = files.filter(name => !existsSync(join(target, name)) || digest(join(source, name)) !== digest(join(target, name)))

if (checkOnly) {
  if (stale.length) {
    console.error(`public/vision/wasm does not match @mediapipe/tasks-vision ${version}:`)
    stale.forEach(name => console.error(`- ${name}`))
    console.error('Run `npm run vision:sync` and commit the result.')
    process.exit(1)
  }
  console.log(`Vision runtime check passed: ${files.length} files match @mediapipe/tasks-vision ${version}.`)
} else {
  mkdirSync(target, { recursive: true })
  stale.forEach(name => copyFileSync(join(source, name), join(target, name)))
  console.log(`Synced ${stale.length} of ${files.length} vision runtime files from @mediapipe/tasks-vision ${version}.`)
}
