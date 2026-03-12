import { Tray, Menu, nativeImage, nativeTheme, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { showWindowBelowTray, setQuitting } from './window'

let tray: Tray | null = null

const res = (...parts: string[]): string => {
  let basePath: string
  if (app.isPackaged) {
    // In production, resources are in app.asar.unpacked/resources
    // Fallback if process.resourcesPath is undefined
    const resourcesPath =
      process.resourcesPath || join(app.getPath('exe'), '..', 'Resources')
    basePath = join(resourcesPath, 'app.asar.unpacked', 'resources')
  } else {
    basePath = join(__dirname, '../../resources')
  }
  return join(basePath, ...parts)
}

function loadImage(name1x: string, name2x: string, template = false): Electron.NativeImage {
  try {
    const img = nativeImage.createEmpty()
    const path1x = res(name1x)
    const path2x = res(name2x)
    img.addRepresentation({ scaleFactor: 1.0, buffer: readFileSync(path1x) })
    img.addRepresentation({ scaleFactor: 2.0, buffer: readFileSync(path2x) })
    if (template) img.setTemplateImage(true)
    return img
  } catch (err) {
    console.error('[Tray] Failed to load icon:', name1x, err)
    return nativeImage.createEmpty()
  }
}

let normalIcon: Electron.NativeImage
let badgeLightIcon: Electron.NativeImage
let badgeDarkIcon: Electron.NativeImage
let currentHasBadge = false

function buildIcons(): void {
  normalIcon = loadImage('trayIconTemplate.png', 'trayIconTemplate@2x.png', true)
  badgeLightIcon = loadImage('trayIconBadgeLight.png', 'trayIconBadgeLight@2x.png')
  badgeDarkIcon = loadImage('trayIconBadgeDark.png', 'trayIconBadgeDark@2x.png')
}

function getBadgeIcon(): Electron.NativeImage {
  return nativeTheme.shouldUseDarkColors ? badgeDarkIcon : badgeLightIcon
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

  // Update badge icon when system theme changes
  nativeTheme.on('updated', () => {
    if (tray && currentHasBadge) {
      tray.setImage(getBadgeIcon())
    }
  })

  return tray
}

export function updateTrayTitle(pendingCount: number): void {
  if (!tray) return
  const shouldBadge = pendingCount > 0
  if (shouldBadge !== currentHasBadge) {
    currentHasBadge = shouldBadge
    tray.setImage(shouldBadge ? getBadgeIcon() : normalIcon)
  }
  tray.setTitle('')
}
