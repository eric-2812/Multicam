// Cortiva desktop app (Electron). Serves the built web app from a private, secure origin and
// fills in the browser bits a desktop app has to answer itself: permissions, the Bluetooth
// device picker and pairing prompts, screen-share source picking and silent downloads.
const { app, BrowserWindow, protocol, net, session, desktopCapturer, shell, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const DIST = path.join(__dirname, '..', 'dist')

// Only the app's own pages get camera, microphone, Bluetooth and folder access. Anything else
// (a link that somehow loads in the window) gets nothing.
const isApp = (url) => {
  try {
    // (Node's URL gives custom schemes an opaque "null" origin, so compare the parts.)
    const u = new URL(url)
    return u.protocol === 'cortiva:' && u.host === 'app'
  } catch {
    return false
  }
}

// What the page may load. Cameras on the network (IP cameras, the phone broker) can be anywhere,
// so pictures, video and connections stay open; scripts only ever come from the app itself.
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

// Web Bluetooth is on by default on Windows and macOS; Linux keeps it behind this switch.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-experimental-web-platform-features')

// A standard, secure scheme so camera, microphone, Bluetooth and folder access all work.
protocol.registerSchemesAsPrivileged([
  { scheme: 'cortiva', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
])

// Recordings that fall back to downloads go straight into Videos/Cortiva, without a dialog per file.
function recordingsDir() {
  const dir = path.join(app.getPath('videos'), 'Cortiva')
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
    title: 'Cortiva',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // The window only ever shows the app. Links go to the user's browser (below), never in here.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isApp(url)) event.preventDefault()
  })
  win.webContents.on('will-redirect', (event, url) => {
    if (!isApp(url)) event.preventDefault()
  })
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())

  // Web Bluetooth: Electron has no built-in device chooser. The app already filters to GoPro /
  // Sony, so connect to the first matching camera that shows up while scanning.
  let pickTimer = null
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault()
    if (!isApp(win.webContents.getURL())) return callback('')
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

  // Open web links (help pages etc.) in the user's browser, not inside the app. Only plain
  // https links: other schemes could start a program on the computer.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === 'https:') shell.openExternal(url)
    } catch {}
    return { action: 'deny' }
  })

  win.loadURL('cortiva://app/app/index.html')
  return win
}

// ------------------------------------------------------------ updates
// The installed app checks GitHub Releases, downloads a new version in the background and installs
// it when Cortiva closes (or at once with "Restart to update"). The portable .exe can't update
// itself, so it only says that a new version is out. Releases are read from the public repository;
// the download is checked against the SHA-512 published with it.

let updateInfo = { state: 'idle' }
let updateWin = null
const portable = !!process.env.PORTABLE_EXECUTABLE_DIR

function sendUpdate(info) {
  updateInfo = { ...info, portable }
  if (updateWin && !updateWin.isDestroyed()) updateWin.webContents.send('update', updateInfo)
}

function setUpUpdates(win) {
  updateWin = win
  ipcMain.on('update-ready-for-events', (event) => {
    if (isApp(event.senderFrame?.url ?? '')) event.sender.send('update', { ...updateInfo, portable })
  })
  if (!app.isPackaged) return
  let autoUpdater
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch {
    return
  }
  autoUpdater.autoDownload = !portable
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (i) => sendUpdate({ state: portable ? 'available' : 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => sendUpdate({ ...updateInfo, state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ state: 'ready', version: i.version }))
  autoUpdater.on('error', () => {
    // Offline, GitHub unreachable…: try again at the next check, without bothering anyone.
    if (updateInfo.state === 'downloading') sendUpdate({ state: 'idle' })
  })
  ipcMain.on('update-install', (event) => {
    if (!isApp(event.senderFrame?.url ?? '') || updateInfo.state !== 'ready') return
    autoUpdater.quitAndInstall(false, true)
  })
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  setTimeout(check, 8000)
  setInterval(check, 4 * 60 * 60 * 1000)
}

app.whenReady().then(() => {
  // Serve dist/ on cortiva://app/…
  protocol.handle('cortiva', async (req) => {
    const url = new URL(req.url)
    if (url.host !== 'app') return new Response('Not found', { status: 404 })
    let pathname
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    let file = path.normalize(path.join(DIST, pathname))
    // Never serve anything outside dist/ (also blocks look-alikes such as "dist-old").
    if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('Not found', { status: 404 })
    // The desktop app is the app page (the site root is the web presentation page).
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'app', 'index.html')
    const res = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(res.headers)
    headers.set('Content-Security-Policy', CSP)
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(res.body, { status: res.status, headers })
  })

  const ses = session.defaultSession

  // Camera, microphone, Bluetooth, screen and folder access are what the app is for.
  const allowed = new Set(['media', 'bluetooth', 'display-capture', 'fileSystem', 'clipboard-sanitized-write', 'notifications', 'fullscreen'])
  ses.setPermissionRequestHandler((wc, permission, cb, details) =>
    cb(allowed.has(permission) && isApp(details.requestingUrl || wc.getURL())),
  )
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => allowed.has(permission) && isApp(requestingOrigin))
  // Only Bluetooth devices (GoPro / Sony) — no USB, serial or HID access for anything.
  ses.setDevicePermissionHandler((details) => details.deviceType === 'bluetooth' && isApp(details.origin))

  // Bluetooth pairing prompts (Sony cameras bond on first use).
  if (ses.setBluetoothPairingHandler) {
    ses.setBluetoothPairingHandler((details, cb) => {
      // Always ask: pairing gives the device a lasting bond with this computer.
      if (details.pairingKind === 'providePin') {
        cb({ confirmed: false })
      } else {
        const r = dialog.showMessageBoxSync({
          type: 'question',
          buttons: ['Pair', 'Cancel'],
          defaultId: 0,
          message: 'Pair this camera with the computer?',
          detail: details.pin ? `Check that the camera shows ${details.pin}.` : 'Only pair a camera you are setting up right now.',
        })
        cb({ confirmed: r === 0 })
      }
    })
  }

  // Screen share: offer the whole primary screen, with system audio on Windows.
  ses.setDisplayMediaRequestHandler(
    async (req, cb) => {
      if (!isApp(req.securityOrigin)) return cb({})
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
      cb({ video: sources[0], audio: process.platform === 'win32' ? 'loopback' : undefined })
    },
    { useSystemPicker: true },
  )

  ses.on('will-download', (e, item, wc) => {
    if (wc && !isApp(wc.getURL())) return e.preventDefault()
    // Just a file name: no folders, no reserved characters, never a path out of Videos/Cortiva.
    const name = path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '') || 'recording'
    item.setSavePath(path.join(recordingsDir(), name))
  })

  setUpUpdates(createWindow())
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

// No new windows or webviews other than the app's own.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
