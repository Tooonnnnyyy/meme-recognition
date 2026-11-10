// Colour theme shared by every page. "system" follows the operating system;
// "light" and "dark" pin a theme by setting data-theme on <html>, which the
// stylesheets read. The choice is a per-viewer convenience in localStorage,
// and public/theme-boot.js applies it before first paint.
const KEY = 'theme'
export const THEMES = ['system', 'light', 'dark']

export function storedTheme() {
  try {
    const value = localStorage.getItem(KEY)
    return THEMES.includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme
  else delete root.dataset.theme
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // Storage can be blocked (private windows); the theme still applies for this visit.
  }
}
