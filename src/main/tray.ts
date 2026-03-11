import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { showWindowBelowTray, setQuitting } from './window'

let tray: Tray | null = null

const res = (...parts: string[]): string => join(__dirname, '../../resources', ...parts)

function loadTemplate(): Electron.NativeImage {
  const img = nativeImage.createEmpty()
  img.addRepresentation({ scaleFactor: 1.0, buffer: readFileSync(res('trayIconTemplate.png')) })
  img.addRepresentation({ scaleFactor: 2.0, buffer: readFileSync(res('trayIconTemplate@2x.png')) })
  img.setTemplateImage(true)
  return img
}

function loadBadge(): Electron.NativeImage {
  const img = nativeImage.createEmpty()
  img.addRepresentation({ scaleFactor: 1.0, buffer: readFileSync(res('trayIconBadge.png')) })
  img.addRepresentation({ scaleFactor: 2.0, buffer: readFileSync(res('trayIconBadge@2x.png')) })
  return img
}

let normalIcon: Electron.NativeImage
let badgeIcon: Electron.NativeImage
let currentHasBadge = false

function buildIcons(): void {
  normalIcon = loadTemplate()
  badgeIcon = loadBadge()
}

export function createTray(
  win: BrowserWindow,
  onBulkApprove: () => void
): Tray {
  buildIcons()

  tray = new Tray(normalIcon)
  tray.setToolTip('Ghostride')

  // Left-click: toggle popover panel below tray icon
  tray.on('click', (_event, bounds) => {
    if (win.isVisible()) {
      win.hide()
    } else {
      showWindowBelowTray(bounds)
    }
  })

  // Right-click: context menu
  tray.on('right-click', () => {
    if (!tray) return
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Approve All',
        accelerator: 'CmdOrCtrl+A',
        click: (): void => {
          onBulkApprove()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: (): void => {
          setQuitting(true)
          app.quit()
        }
      }
    ])
    tray!.popUpContextMenu(contextMenu)
  })

  return tray
}

export function updateTrayTitle(pendingCount: number): void {
  if (!tray) return
  const shouldBadge = pendingCount > 0
  if (shouldBadge !== currentHasBadge) {
    currentHasBadge = shouldBadge
    tray.setImage(shouldBadge ? badgeIcon : normalIcon)
  }
  tray.setTitle('')
}
