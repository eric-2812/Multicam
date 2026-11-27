import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { transform as minifyCss } from 'lightningcss'
import { minify as minifyJs } from 'rolldown/utils'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// What the built page may load (the desktop app sends the same policy as a header). Scripts only
// come from the app itself; pictures, video and connections stay open because IP cameras and the
// phone broker can be anywhere. Only added to the build: the dev server injects inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: http: https:",
  "media-src 'self' data: blob: http: https:",
  "connect-src 'self' http: https: ws: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const csp = (): Plugin => ({
  name: 'cortiva-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
})

// The presentation page's design kit is copied from public/ as it is (it finds its own files at run
// time, so it can't be bundled). Minify those copies so the page downloads less. The motion layer is
// left exactly as the kit ships it: the kit's design check recognises it by its source.
const KEEP = new Set(['motion/motion.js', 'motion/motion.css'])
const minifyKit = (): Plugin => ({
  name: 'cortiva-minify-kit',
  apply: 'build',
  async closeBundle() {
    const dir = join(import.meta.dirname, 'dist', 'kit')
    for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
      const file = join(dir, name)
      if (KEEP.has(name.replaceAll('\\', '/'))) continue
      if (name.endsWith('.css')) {
        writeFileSync(file, minifyCss({ filename: name, code: readFileSync(file), minify: true }).code)
      } else if (name.endsWith('.js')) {
        const { code, errors } = await minifyJs(name, readFileSync(file, 'utf8'), { module: name !== 'head.js' })
        if (errors.length) throw new Error(`${name}: ${errors[0].message}`)
        writeFileSync(file, code)
      }
    }
    // The page links the kit's stylesheets one after the other; serve each run of them as one file,
    // in the same order, so the first paint waits for fewer downloads.
    const page = join(import.meta.dirname, 'dist', 'index.html')
    let html = readFileSync(page, 'utf8')
    const links = [...html.matchAll(/^\s*<link rel="stylesheet" href="\.\/kit\/([\w/.-]+\.css)" \/>\n/gm)]
    const runs: (typeof links)[] = [[]]
    for (const m of links) {
      if (KEEP.has(m[1])) runs.push([])
      else runs[runs.length - 1].push(m)
    }
    runs.forEach((run, i) => {
      if (run.length < 2) return
      const name = `kit-${i + 1}.css`
      writeFileSync(join(dir, name), run.map((m) => readFileSync(join(dir, m[1]), 'utf8')).join('\n'))
      html = html.replace(run[0][0], run[0][0].replace(/href="[^"]+"/, `href="./kit/${name}"`))
      for (const m of run.slice(1)) html = html.replace(m[0], '')
    })
    writeFileSync(page, html)
  },
})

export default defineConfig({
  // Relative paths so the build works on GitHub Pages or any subfolder.
  base: './',
  plugins: [react(), csp(), minifyKit()],
  // Two pages: the presentation page at the site root, the app itself under app/.
  build: {
    rollupOptions: {
      input: { home: 'index.html', app: 'app/index.html' },
    },
  },
  // Shown in the status bar, so the web and the desktop app say which release they are.
  define: { __APP_VERSION__: JSON.stringify(version) },
})
