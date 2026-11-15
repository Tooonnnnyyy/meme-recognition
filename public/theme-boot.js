// Applies a saved light/dark choice and the interface language before the
// first paint, so the page does not flash the other theme or announce the
// wrong language while the app loads (see src/theme.js and src/i18n/index.js).
try {
  var saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved
} catch (error) {
  // Storage blocked: follow the system theme.
}
(function () {
  var lang = null
  try { lang = localStorage.getItem('lang') } catch (error) { /* storage blocked: follow the system */ }
  if (lang !== 'en' && lang !== 'zh') {
    lang = 'en'
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]
    for (var i = 0; i < list.length; i += 1) {
      var base = String(list[i] || '').toLowerCase().split(/[-_]/)[0]
      if (base === 'en' || base === 'zh') { lang = base; break }
    }
  }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
})()
