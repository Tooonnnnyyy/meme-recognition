import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { NAMESPACES } from '../src/i18n/catalog.js'
import { TextError, errorText, systemLang, translate, translator } from '../src/i18n/index.js'

const placeholders = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

test('every namespace has the same keys in English and Chinese', () => {
  for (const [namespace, messages] of Object.entries(NAMESPACES)) {
    const en = Object.keys(messages.en || {}).sort()
    const zh = Object.keys(messages.zh || {}).sort()
    assert.deepEqual(zh.filter(key => !en.includes(key)), [], `${namespace}: keys only in zh`)
    assert.deepEqual(en.filter(key => !zh.includes(key)), [], `${namespace}: keys missing from zh`)
  }
})

test('messages are non-empty and keep the same placeholders in both languages', () => {
  for (const [namespace, messages] of Object.entries(NAMESPACES)) {
    for (const [key, en] of Object.entries(messages.en || {})) {
      const zh = messages.zh?.[key]
      for (const [lang, value] of [['en', en], ['zh', zh]]) {
        assert.ok(typeof value === 'function' || (typeof value === 'string' && value.trim()), `${namespace}.${key} (${lang}) is empty`)
      }
      if (typeof en === 'string' && typeof zh === 'string') assert.deepEqual(placeholders(zh), placeholders(en), `${namespace}.${key}: placeholders differ`)
    }
  }
})

test('Chinese messages are written in Chinese', () => {
  // A zh message that is only Latin letters was probably not translated.
  // Brand names, scale names and file formats stay as they are.
  const KEEP = /^(?:[\s\d\W]|Usability Lab|Usability Copilot|Figma|SUS|SEQ|UMUX-Lite|CSV|JSON|Markdown|IndexedDB|TCPS 2|AOI|EN|ID|P\d+|[A-Z]|\{\w+\})*$/u
  for (const [namespace, messages] of Object.entries(NAMESPACES)) {
    for (const [key, value] of Object.entries(messages.zh || {})) {
      if (typeof value !== 'string' || /\p{Script=Han}/u.test(value)) continue
      assert.match(value, KEEP, `${namespace}.${key} looks untranslated: ${JSON.stringify(value)}`)
    }
  }
})

test('translate fills placeholders, falls back to English, then to the key', () => {
  assert.equal(translate('zh', 'common.language'), '语言')
  assert.equal(translate('fr', 'common.language'), 'Language')
  assert.equal(translate('en', 'common.no-such-key'), 'common.no-such-key')
  assert.equal(translator('zh').lang, 'zh')
  assert.equal(translator('xx').lang, 'en')
})

test('the system language is the first supported one in the preference list', () => {
  assert.equal(systemLang(['zh-CN', 'en-US']), 'zh')
  assert.equal(systemLang(['fr-CA', 'zh-Hant-TW']), 'zh')
  assert.equal(systemLang(['en-CA', 'zh-CN']), 'en')
  assert.equal(systemLang(['fr-CA']), 'en')
  assert.equal(systemLang([]), 'en')
})

test('a TextError shows in either language', () => {
  const error = new TextError('common.language')
  assert.equal(error.message, 'Language')
  assert.equal(errorText(translator('zh'), error), '语言')
  assert.equal(errorText(translator('zh'), new Error('plain')), 'plain')
})

// No English left in the markup of the translated screens. Text between tags
// and the user-facing attributes must come from t(). Names that stay as they
// are in every language are allowed.
const ALLOWED = /^(?:Usability Lab|Usability Copilot|Figma|SUS|SEQ|UMUX-Lite|CSV|JSON|Markdown|EN|AOI|Gesture World|Motion Lab|[A-Z]|[\s\d\W])*$/u
const SCREENS = [
  ...readdirSync('src/lab').filter(name => name.endsWith('.jsx')).map(name => join('src/lab', name)),
  ...readdirSync('src/research').filter(name => name.endsWith('.jsx')).map(name => join('src/research', name)),
  'src/main.jsx', 'src/Lookalike.jsx', 'src/ThemeToggle.jsx', 'src/i18n/react.jsx',
]
const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')

test('screens have no hard-coded English text', () => {
  const found = []
  for (const file of SCREENS) {
    // Arrow functions are code, not the end of a tag.
    const source = stripComments(readFileSync(file, 'utf8')).replace(/=>/g, '=')
    for (const match of source.matchAll(/>([^<>{}]+)</g)) {
      const text = match[1].trim()
      if (/[A-Za-z]{2,}/.test(text) && !ALLOWED.test(text)) found.push(`${file}: text ${JSON.stringify(text.slice(0, 60))}`)
    }
    for (const match of source.matchAll(/\b(aria-label|placeholder|title|alt)="([^"]*)"/g)) {
      if (/[A-Za-z]{2,}/.test(match[2]) && !ALLOWED.test(match[2])) found.push(`${file}: ${match[1]} ${JSON.stringify(match[2].slice(0, 60))}`)
    }
  }
  assert.deepEqual(found, [], `${found.length} hard-coded strings:\n${found.join('\n')}`)
})

test('durations read as words in both languages', async () => {
  const { durationText } = await import('../src/i18n/index.js')
  assert.equal(durationText('en', 30), '30 seconds')
  assert.equal(durationText('en', 60), '1 minute')
  assert.equal(durationText('en', 90), '1 min 30 s')
  assert.equal(durationText('en', 300), '5 minutes')
  assert.equal(durationText('zh', 30), '30秒')
  assert.equal(durationText('zh', 90), '1分30秒')
  assert.equal(durationText('zh', 300), '5分钟')
})
