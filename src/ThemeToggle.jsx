import React, { useState } from 'react'
import { applyTheme, storedTheme } from './theme'

const OPTIONS = [{ id: 'system', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]

// Three-way switch (follow the system, or pin light or dark). Each page's
// stylesheet styles .theme-toggle.
export function ThemeToggle() {
  const [theme, setTheme] = useState(storedTheme)
  return <div className="theme-toggle" role="group" aria-label="Colour theme">
    {OPTIONS.map(option => <button key={option.id} type="button" aria-pressed={theme === option.id} onClick={() => { applyTheme(option.id); setTheme(option.id) }}>{option.label}</button>)}
  </div>
}
