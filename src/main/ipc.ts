import { ipcMain } from 'electron'
import type { ClaudeProcess } from './types'
import { ApprovalHandler } from './approval-handler'

export function registerIpcHandlers(
  getProcessMap: () => Map<string, ClaudeProcess>,
  approvalHandler: ApprovalHandler
): void {
  ipcMain.handle('approve', async (_event, sessionId: string) => {
    console.log('[IPC] approve called, sessionId:', sessionId)
    const proc = getProcessMap().get(sessionId)
    if (!proc) {
      console.log('[IPC] process not found in map. Keys:', [...getProcessMap().keys()])
      return { success: false, error: 'Process not found' }
    }
    console.log('[IPC] sending to tty:', proc.tty)
    const result = await approvalHandler.approve(proc.tty)
    console.log('[IPC] approve result:', result)
    return result
  })

  ipcMain.handle('reject', async (_event, sessionId: string) => {
    const proc = getProcessMap().get(sessionId)
    if (!proc) return { success: false, error: 'Process not found' }
    return await approvalHandler.reject(proc.tty)
  })

  ipcMain.handle('bulk-approve', async () => {
    const processMap = getProcessMap()
    let approved = 0
    let failed = 0

    for (const proc of processMap.values()) {
      if (proc.status === 'approval') {
        const result = await approvalHandler.approve(proc.tty)
        if (result.success) approved++
        else failed++
      }
    }

    return { approved, failed }
  })
}
