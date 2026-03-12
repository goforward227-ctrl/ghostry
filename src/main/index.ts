import { app, Menu, Notification } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow, getMainWindow } from './window'
import { createTray, updateTrayTitle } from './tray'
import { registerIpcHandlers } from './ipc'
import { ProcessScanner } from './process-scanner'
import { SessionWatcher } from './session-watcher'
import { ApprovalHandler } from './approval-handler'
import { findSessionsForCwd, parseSession } from './session-parser'
import { basename, join } from 'path'
import { t } from './i18n'
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
const notifiedApprovalIds = new Set<string>() // Track notified approval sessions
const autoApprovedIds = new Set<string>() // Track auto-approved sessions to prevent duplicates

// Project settings persisted by cwd
interface ProjectSetting {
  name?: string
  autoApprove?: boolean
}
let projectSettings: Record<string, ProjectSetting> = {}

function getProjectSettingsPath(): string {
  return join(app.getPath('userData'), 'project-names.json')
}

function loadProjectSettings(): void {
  try {
    const raw = JSON.parse(readFileSync(getProjectSettingsPath(), 'utf-8'))
    // Migrate old format: Record<string, string> → Record<string, ProjectSetting>
    projectSettings = {}
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'string') {
        projectSettings[key] = { name: val }
      } else {
        projectSettings[key] = val as ProjectSetting
      }
    }
  } catch {
    projectSettings = {}
  }
}

function saveProjectSettings(): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(getProjectSettingsPath(), JSON.stringify(projectSettings, null, 2))
  } catch {
    // ignore
  }
}

function renameProject(sessionId: string, newName: string): boolean {
  const proc = processMap.get(sessionId)
  if (!proc) return false
  const trimmed = newName.trim()
  if (!trimmed) return false
  if (!projectSettings[proc.cwd]) projectSettings[proc.cwd] = {}
  projectSettings[proc.cwd].name = trimmed
  proc.name = trimmed
  saveProjectSettings()
  sendProcessesToRenderer()
  return true
}

function setAutoApprove(sessionId: string, enabled: boolean): boolean {
  const proc = processMap.get(sessionId)
  if (!proc) return false
  if (!projectSettings[proc.cwd]) projectSettings[proc.cwd] = {}
  projectSettings[proc.cwd].autoApprove = enabled
  proc.autoApprove = enabled
  saveProjectSettings()
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
      try {
        const result = await approvalHandler.approve(proc.tty)
        if (result.success) approved++
      } catch {
        // Skip failed approvals
      }
    }
  }
  if (approved > 0) {
    setTimeout(() => scanner.scan(), 500)
  }
}

function mergeProcessData(scanResults: ScanResult[]): void {
  const aliveSessionIds = new Set<string>()
  const usedSessionIds = new Set<string>()

  for (const scan of scanResults) {
    const sessions = findSessionsForCwd(scan.cwd)
    // Pick the first session not already claimed by another process
    const session = sessions.find((s) => !usedSessionIds.has(s.sessionId))
    if (!session) continue

    const parsed = parseSession(session.filePath, true)
    if (!parsed) continue

    usedSessionIds.add(session.sessionId)
    aliveSessionIds.add(session.sessionId)

    const existing = processMap.get(session.sessionId)
    const settings = projectSettings[scan.cwd]
    const proc: ClaudeProcess = {
      id: session.sessionId,
      pid: scan.pid,
      cwd: scan.cwd,
      tty: scan.tty,
      status: parsed.status,
      name: settings?.name || existing?.name || basename(scan.cwd),
      message: parsed.message,
      lastTimestamp: parsed.lastTimestamp,
      autoApprove: settings?.autoApprove || false
    }
    processMap.set(session.sessionId, proc)

    // Auto-approve: fire-and-forget when enabled (prevent duplicate sends)
    if (proc.status === 'approval' && proc.autoApprove && !autoApprovedIds.has(proc.id)) {
      autoApprovedIds.add(proc.id)
      approvalHandler.approve(proc.tty).catch(() => {})
      // Keep in processMap but mark as handled - will be cleaned up when status changes
    }

    // Clear auto-approved flag when status changes from approval
    if (proc.status !== 'approval') {
      autoApprovedIds.delete(proc.id)
    }

    // Notify once when approval status is detected (skip if auto-approve is enabled)
    if (proc.status === 'approval' && !proc.autoApprove && !notifiedApprovalIds.has(proc.id)) {
      notifiedApprovalIds.add(proc.id)
      const notification = new Notification({
        title: 'Ghostry',
        body: `${proc.name}: ${t().approvalRequired}`,
        actions: [{ type: 'button', text: t().approve }]
      })
      notification.on('action', () => {
        approvalHandler.approve(proc.tty).catch(() => {})
        setTimeout(() => scanner.scan(), 500)
      })
      notification.on('click', () => {
        const win = getMainWindow()
        if (win) {
          win.show()
          win.focus()
        }
      })
      notification.show()
    }
    if (proc.status !== 'approval') {
      notifiedApprovalIds.delete(proc.id)
    }

    // Notify once when input status is detected
    if (proc.status === 'input' && !notifiedInputIds.has(proc.id)) {
      notifiedInputIds.add(proc.id)
      new Notification({
        title: 'Ghostry',
        body: `${proc.name}: ${t().waitingForInput}`
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
      notifiedApprovalIds.delete(sessionId)
      autoApprovedIds.delete(sessionId)
    }
  }

  // Clean up stale notifiedInputIds entries
  for (const id of notifiedInputIds) {
    if (!processMap.has(id)) {
      notifiedInputIds.delete(id)
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
  electronApp.setAppUserModelId('com.ghostry.app')

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
      label: 'Ghostry',
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

  loadProjectSettings()
  registerIpcHandlers(getProcessMap, approvalHandler, renameProject, setAutoApprove, sendProcessesToRenderer)

  scanner.on('processes', (results: ScanResult[]) => {
    mergeProcessData(results)
  })

  watcher.on('session-changed', () => {
    scanner.scan()
  })

  // Start scanner and watcher immediately (don't wait for window load)
  scanner.start(1500)
  watcher.start()

  // Track renderer readiness (HMR reloads cause frame disposal)
  win.webContents.on('did-finish-load', () => {
    rendererReady = true
    sendProcessesToRenderer()
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
