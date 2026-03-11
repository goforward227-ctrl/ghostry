import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { showWindowBelowTray, setQuitting } from './window'

let tray: Tray | null = null

export function createTray(
  win: BrowserWindow,
  onBulkApprove: () => void
): Tray {
  const iconPath = join(__dirname, '../../resources/trayIconTemplate.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    icon.setTemplateImage(true)
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('CCBuddy')

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
        label: '一括承認',
        accelerator: 'CmdOrCtrl+A',
        click: (): void => {
          onBulkApprove()
        }
      },
      { type: 'separator' },
      {
        label: '終了',
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
  if (tray) {
    tray.setTitle(pendingCount > 0 ? ` ${pendingCount}` : '')
  }
}
