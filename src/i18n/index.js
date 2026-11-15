// Interface language for every page. "system" follows the browser's language
// list (navigator.languages, which follows the operating system unless the
// person changed it); "en" and "zh" pin one. The choice is a per-viewer
// convenience in localStorage, like the colour theme, and
// public/theme-boot.js sets <html lang> from it before the first paint.
//
// A page can also pin a language for this visit only, without touching the
// saved choice: the participant runtime pins the study's language, because
// the consent form, questionnaires and task wording are one research
// instrument and should match.
//
// Messages live in ./messages/<namespace>.js as { en: {...}, zh: {...} } and
// are looked up as "namespace.key". A message is a string with {name}
// placeholders, or a function of the variables (for plurals and grammar).
import { CATALOG } from './catalog.js'

export const LANGS = ['en', 'zh']
export const CHOICES = ['system', ...LANGS]
export const HTML_LANG = { en: 'en', zh: 'zh-CN' }
// Each language named in itself, as the switch shows it.
export const NATIVE = { en: 'English', zh: '中文' }
const KEY = 'lang'

export const isLang = value => LANGS.includes(value)

// The first supported language in the person's preference list, else English.
export function systemLang(languages = browserLanguages()) {
  for (const tag of languages) {
    const base = String(tag || '').toLowerCase().split(/[-_]/)[0]
    if (isLang(base)) return base
  }
  return 'en'
}

function browserLanguages() {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : [navigator.language]
}

export function storedChoice() {
  try {
    const value = localStorage.getItem(KEY)
    return isLang(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

let choice = storedChoice()
let pinned = null
const listeners = new Set()

export const currentChoice = () => choice
export const pinnedLang = () => pinned
export const currentLang = () => pinned || (choice === 'system' ? systemLang() : choice)

function changed() {
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[currentLang()]
  listeners.forEach(listener => listener())
}

// The saved choice: 'system', 'en' or 'zh'.
export function setChoice(next) {
  choice = CHOICES.includes(next) ? next : 'system'
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Storage can be blocked (private windows); the language still applies for this visit.
  }
  changed()
}

// A language for this visit only, over the saved choice; null releases it.
export function pinLang(lang) {
  pinned = isLang(lang) ? lang : null
  changed()
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

if (typeof window !== 'undefined') {
  // The operating system or browser language changed while the page is open.
  window.addEventListener('languagechange', changed)
  // Another tab of this site changed the saved choice.
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return
    choice = storedChoice()
    changed()
  })
  changed()
}

const fill = (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (match, name) => (name in vars && vars[name] != null ? String(vars[name]) : match)) : String(text))

// The message for key in lang, falling back to English, then to the key
// itself so a missing message shows up instead of breaking the page.
export function translate(lang, key, vars) {
  const entry = CATALOG[isLang(lang) ? lang : 'en'][key] ?? CATALOG.en[key]
  if (entry == null) return key
  return fill(typeof entry === 'function' ? entry(vars || {}) : entry, vars)
}

// A translator bound to one language, with t.lang telling which.
export function translator(lang) {
  const t = (key, vars) => translate(lang, key, vars)
  t.lang = isLang(lang) ? lang : 'en'
  return t
}

// An error whose text can be shown in any language. Modules without React
// throw it; the screen that catches it shows errorText(t, error).
export class TextError extends Error {
  constructor(key, vars) {
    super(translate('en', key, vars))
    this.name = 'TextError'
    this.key = key
    this.vars = vars
  }
}
export const errorText = (t, error) => (error && error.key ? t(error.key, error.vars) : String(error?.message || error))

// Numbers and dates in the reader's conventions. English keeps the
// browser's own English locale (en-US, en-GB, en-CA…), as the pages did
// before they had a language switch; Chinese uses zh-CN.
// A tag Intl rejects (some browsers report 'en-US@posix') falls back to 'en'.
const validLocale = tag => { try { return Intl.getCanonicalLocales(tag).length > 0 } catch { return false } }
export function localeFor(lang, languages = browserLanguages()) {
  if (lang === 'zh') return 'zh-CN'
  return languages.find(tag => /^en(?:-|$)/i.test(String(tag || '')) && validLocale(tag)) || 'en'
}
export const formatNumber = (lang, value, options) => new Intl.NumberFormat(localeFor(lang), options).format(value)
// A duration in seconds as words: "30 seconds", "5 minutes", "1 min 30 s".
export function durationText(lang, seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const min = Math.floor(total / 60)
  const sec = total % 60
  if (!min) return translate(lang, 'common.duration.seconds', { count: sec })
  if (!sec) return translate(lang, 'common.duration.minutes', { count: min })
  return translate(lang, 'common.duration.minSec', { min, sec })
}

// A missing or invalid date shows as an empty string instead of throwing.
export function formatDate(lang, value, options = { dateStyle: 'medium' }) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(localeFor(lang), options).format(date)
}
