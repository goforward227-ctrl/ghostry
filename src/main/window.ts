import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

export function setQuitting(value: boolean): void {
  isQuitting = value
}

export function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 520,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    transparent: false,
    vibrancy: 'popover',
    visualEffectState: 'active',
    roundedCorners: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Hide when window loses focus (small delay to allow button clicks to complete)
  let blurTimer: ReturnType<typeof setTimeout> | null = null
  mainWindow.on('blur', () => {
    blurTimer = setTimeout(() => {
      mainWindow?.hide()
    }, 150)
  })
  mainWindow.on('focus', () => {
    if (blurTimer) {
      clearTimeout(blurTimer)
      blurTimer = null
    }
  })

  // Hide instead of close (unless app is quitting)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // Allow quit via Cmd+Q or app.quit()
  app.on('before-quit', () => {
    isQuitting = true
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function showWindowBelowTray(trayBounds: Electron.Rectangle): void {
  if (!mainWindow) return

  const windowBounds = mainWindow.getBounds()
  const display = screen.getDisplayMatching(trayBounds)

  // Center horizontally under the tray icon
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
  // Position just below the menu bar
  const y = trayBounds.y + trayBounds.height + 4

  // Clamp to screen bounds
  const clampedX = Math.max(
    display.workArea.x,
    Math.min(x, display.workArea.x + display.workArea.width - windowBounds.width)
  )

  mainWindow.setPosition(clampedX, y, false)
  mainWindow.show()
  mainWindow.focus()
}
