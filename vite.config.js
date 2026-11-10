import { defineConfig } from 'vite'

// GitHub Pages serves this repository from /meme-recognition/.
// Local development and root-based hosts (Vercel, Netlify, Cloudflare Pages)
// keep the default / base path.
// The dev server injects CSS through <style> tags, which the page's strict
// Content-Security-Policy (style-src 'self') blocks, leaving `npm run dev`
// unstyled. Relax it for the dev server only; builds emit a CSS file and keep
// the original policy.
const devStyleCsp = {
  name: 'dev-style-csp',
  apply: 'serve',
  transformIndexHtml: html => html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"),
}

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [devStyleCsp],
  // Two pages: the meme studio and the Usability Copilot research tool.
  build: { rollupOptions: { input: { main: 'index.html', research: 'research.html' } } },
  // The vision worker is a module worker (MediaPipe loads its ES-module WASM
  // runtime inside it), so it is bundled as ES rather than the default IIFE.
  worker: { format: 'es' },
})
