// Applies a saved light/dark choice before the first paint, so the page does
// not flash the other theme while the app loads (see src/theme.js).
try {
  var saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved
} catch (error) {
  // Storage blocked: follow the system theme.
}
