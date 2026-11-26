/// <reference types="vite/client" />

/** package.json version, e.g. 0.5.0-beta (set in vite.config.ts). */
declare const __APP_VERSION__: string

/** Only in the Windows desktop app (electron/preload.cjs). */
interface Window {
  cortivaDesktop?: {
    onUpdate(cb: (info: { state: 'idle' | 'available' | 'downloading' | 'ready'; version?: string; percent?: number; portable: boolean }) => void): () => void
    installUpdate(): void
  }
}
