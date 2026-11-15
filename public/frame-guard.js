// Keeps research.html and lab.html out of frames on other sites, so another
// page cannot lay its own content over the consent screen or the workspace
// (clickjacking). frame-ancestors and Permissions-Policy only work as HTTP
// headers, which GitHub Pages cannot send, so the page checks for itself.
// Loaded first in <head>, before the app. Frames on this site (same origin)
// are allowed; the pages this site frames (the demo shop, Figma) are other
// documents and do not load this script.
(function () {
  var elsewhere = false
  try {
    // Every ancestor must be readable and on this origin. Reading the
    // location of a page on another origin throws.
    for (var frame = window; frame !== frame.parent; frame = frame.parent) {
      if (frame.parent.location.origin !== window.location.origin) { elsewhere = true; break }
    }
  } catch (error) {
    elsewhere = true
  }
  if (!elsewhere) return
  // Show nothing, and stop loading the rest of the page, so the app never
  // starts.
  document.documentElement.hidden = true
  try { window.stop() } catch (error) { /* hidden is enough */ }
})()
