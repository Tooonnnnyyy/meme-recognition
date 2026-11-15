import React, { useState } from 'react'
import { applyTheme, storedTheme } from './theme'
import { LangToggle, useT } from './i18n/react.jsx'

const OPTIONS = [{ id: 'system', label: 'common.themeAuto' }, { id: 'light', label: 'common.themeLight' }, { id: 'dark', label: 'common.themeDark' }]

// Three-way switch (follow the system, or pin light or dark). Each page's
// stylesheet styles .theme-toggle.
export function ThemeToggle() {
  const t = useT()
  const [theme, setTheme] = useState(storedTheme)
  return <div className="theme-toggle" role="group" aria-label={t('common.theme')}>
    {OPTIONS.map(option => <button key={option.id} type="button" aria-pressed={theme === option.id} onClick={() => { applyTheme(option.id); setTheme(option.id) }}>{t(option.label)}</button>)}
  </div>
}

// The language and theme switches together, for page headers. pinnedLang
// offers English or Chinese for this visit only (see i18n/react.jsx).
export function ViewToggles({ pinnedLang = false }) {
  return <div className="view-toggles"><LangToggle pinned={pinnedLang} /><ThemeToggle /></div>
}
