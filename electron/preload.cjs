// The only things the desktop window can ask the app for: update status and "restart to update".
// Runs isolated (contextIsolation + sandbox); the page never gets Node or Electron itself.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cortivaDesktop', {
  /** Calls back with { state, version, percent?, portable } whenever the update state changes. */
  onUpdate(callback) {
    const listener = (_event, info) => callback(info)
    ipcRenderer.on('update', listener)
    ipcRenderer.send('update-ready-for-events')
    return () => ipcRenderer.removeListener('update', listener)
  },
  /** Quit and install the downloaded update. */
  installUpdate() {
    ipcRenderer.send('update-install')
  },
})
