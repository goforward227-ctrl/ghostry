import { app, Menu, Notification } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow, getMainWindow } from './window'
import { createTray, updateTrayTitle } from './tray'
import { registerIpcHandlers } from './ipc'
import { ProcessScanner } from './process-scanner'
import { SessionWatcher } from './session-watcher'
import { ApprovalHandler } from './approval-handler'
import { findSessionForCwd, parseSession } from './session-parser'
import { basename, join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import type { ClaudeProcess, ScanResult } from './types'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

const processMap = new Map<string, ClaudeProcess>()
const approvalHandler = new ApprovalHandler()
let rendererReady = false
const notifiedInputIds = new Set<string>()

// Project names persisted by cwd
let projectNames: Record<string, string> = {}

function getProjectNamesPath(): string {
  return join(app.getPath('userData'), 'project-names.json')
}

function loadProjectNames(): void {
  try {
    projectNames = JSON.parse(readFileSync(getProjectNamesPath(), 'utf-8'))
  } catch {
    projectNames = {}
  }
}

function saveProjectNames(): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(getProjectNamesPath(), JSON.stringify(projectNames, null, 2))
  } catch {
    // ignore
  }
}

function renameProject(sessionId: string, newName: string): boolean {
  const proc = processMap.get(sessionId)
  if (!proc) return false
  const trimmed = newName.trim()
  if (!trimmed) return false
  projectNames[proc.cwd] = trimmed
  proc.name = trimmed
  saveProjectNames()
  sendProcessesToRenderer()
  return true
}

function getProcessMap(): Map<string, ClaudeProcess> {
  return processMap
}

function sendProcessesToRenderer(): void {
  const pendingCount = Array.from(processMap.values()).filter(
    (p) => p.status === 'approval' || p.status === 'input'
  ).length
  updateTrayTitle(pendingCount)

  if (!rendererReady) return
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  try {
    const processes = Array.from(processMap.values())
    win.webContents.send('processes-updated', processes)
  } catch {
    rendererReady = false
  }
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
      name: projectNames[scan.cwd] || existing?.name || basename(scan.cwd),
      message: parsed.message,
      lastTimestamp: parsed.lastTimestamp
    }
    processMap.set(session.sessionId, proc)

    // Notify once when input status is detected
    if (proc.status === 'input' && !notifiedInputIds.has(proc.id)) {
      notifiedInputIds.add(proc.id)
      new Notification({
        title: 'Ghostride',
        body: `${proc.name}: Waiting for your input`
      }).show()
    }
    if (proc.status !== 'input') {
      notifiedInputIds.delete(proc.id)
    }
  }

  for (const [sessionId, proc] of processMap) {
    if (!aliveSessionIds.has(proc.id)) {
      processMap.delete(sessionId)
      notifiedInputIds.delete(sessionId)
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
  electronApp.setAppUserModelId('com.ghostride.app')

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
      label: 'Ghostride',
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

  loadProjectNames()
  registerIpcHandlers(getProcessMap, approvalHandler, renameProject, sendProcessesToRenderer)

  scanner.on('processes', (results: ScanResult[]) => {
    mergeProcessData(results)
  })

  watcher.on('session-changed', () => {
    scanner.scan()
  })

  // Track renderer readiness (HMR reloads cause frame disposal)
  win.webContents.on('did-finish-load', () => {
    rendererReady = true
    sendProcessesToRenderer()
    scanner.start(1500)
    watcher.start()
  })
  win.webContents.on('did-start-navigation', () => {
    rendererReady = false
  })
})

app.on('window-all-closed', () => {
  // Keep running (menu bar app)
})

app.on('before-quit', () => {
  scanner.stop()
  watcher.stop()
})
