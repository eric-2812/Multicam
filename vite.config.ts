import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative paths so the build works on GitHub Pages or any subfolder.
  base: './',
  plugins: [react()],
})
