import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const forbiddenFiles = /(^|\/)(\.env(?:\..*)?|id_rsa|.*\.(?:pem|p12|pfx|key))$/i
const secretPatterns = [
  ['GitHub token', /gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['OpenAI key', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{20,}/],
  ['private key', /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/],
]

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
const findings = []

for (const file of files) {
  if (forbiddenFiles.test(file)) findings.push(`${file}: sensitive filename is tracked`)
  const data = readFileSync(file)
  if (data.includes(0)) continue
  const text = data.toString('utf8')
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) findings.push(`${file}: possible ${label}`)
  }
}

if (findings.length) {
  console.error('Security check failed. Remove the credential or sensitive file before committing:')
  findings.forEach(finding => console.error(`- ${finding}`))
  process.exit(1)
}

console.log(`Security check passed: ${files.length} tracked files scanned.`)
