import React, { Fragment, useMemo, useSyncExternalStore } from 'react'
import { CHOICES, HTML_LANG, LANGS, NATIVE, currentChoice, currentLang, pinLang, setChoice, subscribe, translator } from './index.js'

// The language this screen renders in; re-renders when it changes.
export const useLang = () => useSyncExternalStore(subscribe, currentLang, () => 'en')

// t(key, vars) for the current language, with t.lang.
export function useT() {
  const lang = useLang()
  return useMemo(() => translator(lang), [lang])
}

// A message with inline markup, e.g. "Open <link>the guide</link> first."
// tags maps each tag name to a function of its inner text that returns an
// element. Tags do not nest.
export function Rich({ text, tags = {} }) {
  const parts = []
  const pattern = /<(\w+)>([\s\S]*?)<\/\1>/g
  let last = 0
  let match
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const render = tags[match[1]]
    parts.push(render ? render(match[2]) : match[2])
    last = pattern.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>
}

// The language switch, next to the theme switch. By default it saves the
// viewer's choice (Auto follows the system). With pinned it changes only this
// visit's language, which is how the participant runtime offers English or
// Chinese over the study's language.
export function LangToggle({ pinned = false }) {
  const t = useT()
  const lang = useLang()
  const choice = useSyncExternalStore(subscribe, currentChoice, () => 'system')
  const options = pinned ? LANGS : CHOICES
  return <div className="theme-toggle lang-toggle" role="group" aria-label={t('common.language')}>
    {options.map(id => {
      const pressed = pinned ? lang === id : choice === id
      if (id === 'system') return <button key={id} type="button" aria-pressed={pressed} title={t('common.languageAutoHint')} onClick={() => setChoice('system')}>{t('common.languageAuto')}</button>
      return <button key={id} type="button" lang={HTML_LANG[id]} aria-pressed={pressed} aria-label={NATIVE[id]} onClick={() => (pinned ? pinLang(id) : setChoice(id))}>{id === 'en' ? 'EN' : NATIVE[id]}</button>
    })}
  </div>
}
