import { defineConfig } from 'vite'

// GitHub Pages serves this repository from /meme-recognition/.
// Local development and root-based hosts (Vercel, Netlify, Cloudflare Pages)
// keep the default / base path.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
})
