// Tally desktop app (Electron). Serves the built web app from a private, secure origin and
// fills in the browser bits a desktop app has to answer itself: permissions, the Bluetooth
// device picker and pairing prompts, screen-share source picking and silent downloads.
const { app, BrowserWindow, protocol, net, session, desktopCapturer, shell, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const DIST = path.join(__dirname, '..', 'dist')

// Web Bluetooth is on by default on Windows and macOS; Linux keeps it behind this switch.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-experimental-web-platform-features')

// A standard, secure scheme so camera, microphone, Bluetooth and folder access all work.
protocol.registerSchemesAsPrivileged([
  { scheme: 'tally', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
])

// Recordings that fall back to downloads go straight into Videos/Tally, without a dialog per file.
function recordingsDir() {
  const dir = path.join(app.getPath('videos'), 'Tally')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#09090b',
    title: 'Tally',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  })

  // Web Bluetooth: Electron has no built-in device chooser. The app already filters to GoPro /
  // Sony, so connect to the first matching camera that shows up while scanning.
  let pickTimer = null
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault()
    if (devices.length) {
      clearTimeout(pickTimer)
      pickTimer = null
      callback(devices[0].deviceId)
    } else if (!pickTimer) {
      // Nothing found within 20 s: cancel, so the app shows "no camera found".
      pickTimer = setTimeout(() => {
        pickTimer = null
        callback('')
      }, 20000)
    }
  })

  // Open links (help pages etc.) in the user's browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadURL('tally://app/index.html')
}

app.whenReady().then(() => {
  // Serve dist/ on tally://app/…
  protocol.handle('tally', (req) => {
    const url = new URL(req.url)
    let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)))
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 })
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    return net.fetch(pathToFileURL(file).toString())
  })

  const ses = session.defaultSession

  // Camera, microphone, Bluetooth, screen and folder access are what the app is for.
  const allowed = new Set(['media', 'bluetooth', 'display-capture', 'fileSystem', 'clipboard-sanitized-write', 'notifications', 'fullscreen'])
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)))
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission) || permission === 'bluetooth' || permission === 'media')
  ses.setDevicePermissionHandler(() => true)

  // Bluetooth pairing prompts (Sony cameras bond on first use).
  if (ses.setBluetoothPairingHandler) {
    ses.setBluetoothPairingHandler((details, cb) => {
      if (details.pairingKind === 'confirm' || details.pairingKind === 'confirmPin') {
        const r = dialog.showMessageBoxSync({
          type: 'question',
          buttons: ['Pair', 'Cancel'],
          defaultId: 0,
          message: `Pair with ${details.deviceId}?`,
          detail: details.pin ? `Check that the camera shows ${details.pin}.` : '',
        })
        cb({ confirmed: r === 0 })
      } else {
        cb({ confirmed: true })
      }
    })
  }

  // Screen share: offer the whole primary screen, with system audio on Windows.
  ses.setDisplayMediaRequestHandler(
    async (_req, cb) => {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
      cb({ video: sources[0], audio: process.platform === 'win32' ? 'loopback' : undefined })
    },
    { useSystemPicker: true },
  )

  ses.on('will-download', (_e, item) => {
    item.setSavePath(path.join(recordingsDir(), item.getFilename()))
  })

  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
