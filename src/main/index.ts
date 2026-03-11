import { app, Menu } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow, getMainWindow } from './window'
import { createTray, updateTrayTitle } from './tray'
import { registerIpcHandlers } from './ipc'
import { ProcessScanner } from './process-scanner'
import { SessionWatcher } from './session-watcher'
import { ApprovalHandler } from './approval-handler'
import { findSessionForCwd, parseSession } from './session-parser'
import { basename } from 'path'
import type { ClaudeProcess, ScanResult } from './types'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

const processMap = new Map<string, ClaudeProcess>()
const approvalHandler = new ApprovalHandler()

function getProcessMap(): Map<string, ClaudeProcess> {
  return processMap
}

function sendProcessesToRenderer(): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) return
  try {
    const processes = Array.from(processMap.values())
    win.webContents.send('processes-updated', processes)
  } catch {
    // Renderer not ready yet (HMR reload, etc.)
  }

  const pendingCount = Array.from(processMap.values()).filter(
    (p) => p.status === 'approval'
  ).length
  updateTrayTitle(pendingCount)
}

async function handleBulkApprove(): Promise<void> {
  let approved = 0
  for (const proc of processMap.values()) {
    if (proc.status === 'approval') {
      const result = await approvalHandler.approve(proc.tty)
      if (result.success) approved++
    }
  }
  if (approved > 0) {
    setTimeout(() => scanner.scan(), 500)
  }
}

function mergeProcessData(scanResults: ScanResult[]): void {
  const aliveSessionIds = new Set<string>()

  for (const scan of scanResults) {
    const session = findSessionForCwd(scan.cwd)
    if (!session) continue

    const parsed = parseSession(session.filePath, true)
    if (!parsed) continue

    aliveSessionIds.add(session.sessionId)

    const existing = processMap.get(session.sessionId)
    const proc: ClaudeProcess = {
      id: session.sessionId,
      pid: scan.pid,
      cwd: scan.cwd,
      tty: scan.tty,
      status: parsed.status,
      name: existing?.name || basename(scan.cwd),
      message: parsed.message,
      lastTimestamp: parsed.lastTimestamp
    }
    processMap.set(session.sessionId, proc)
  }

  for (const [, proc] of processMap) {
    if (!aliveSessionIds.has(proc.id) && proc.status !== 'done') {
      proc.status = 'done'
    }
  }

  const fiveMinAgo = Date.now() - 5 * 60 * 1000
  for (const [sessionId, proc] of processMap) {
    if (proc.status === 'done' && proc.lastTimestamp < fiveMinAgo) {
      processMap.delete(sessionId)
    }
  }

  sendProcessesToRenderer()
}

const scanner = new ProcessScanner()
const watcher = new SessionWatcher()

// Second instance tried to launch → show existing window
app.on('second-instance', () => {
  const win = getMainWindow()
  if (win) {
    win.show()
    win.focus()
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ccbuddy.app')

  // Hide from Dock - menu bar only app
  app.dock?.hide()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const win = createWindow()
  createTray(win, handleBulkApprove)

  // Minimal app menu (for keyboard shortcut to work)
  const menu = Menu.buildFromTemplate([
    {
      label: 'CCBuddy',
      submenu: [
        {
          label: '一括承認',
          accelerator: 'CmdOrCtrl+A',
          click: (): void => {
            handleBulkApprove()
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  registerIpcHandlers(getProcessMap, approvalHandler)

  scanner.on('processes', (results: ScanResult[]) => {
    mergeProcessData(results)
  })

  watcher.on('session-changed', () => {
    scanner.scan()
  })

  // Wait for renderer to be ready before starting scanning
  win.webContents.on('did-finish-load', () => {
    scanner.start(3000)
    watcher.start()
  })
})

app.on('window-all-closed', () => {
  // Keep running (menu bar app)
})

app.on('before-quit', () => {
  scanner.stop()
  watcher.stop()
})
