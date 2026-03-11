import { contextBridge, ipcRenderer } from 'electron'

export interface GhostrideAPI {
  onProcessesUpdated: (callback: (processes: ClaudeProcessDTO[]) => void) => () => void
  approve: (id: string) => Promise<{ success: boolean; error?: string }>
  reject: (id: string) => Promise<{ success: boolean; error?: string }>
  bulkApprove: () => Promise<{ approved: number; failed: number }>
  rename: (id: string, newName: string) => Promise<boolean>
  setAutoApprove: (id: string, enabled: boolean) => Promise<boolean>
}

export interface ClaudeProcessDTO {
  id: string
  pid: number
  status: 'approval' | 'input' | 'running' | 'idle' | 'done'
  name: string
  message: string
  lastTimestamp: number
}

const api: GhostrideAPI = {
  onProcessesUpdated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, processes: ClaudeProcessDTO[]): void => {
      callback(processes)
    }
    ipcRenderer.on('processes-updated', handler)
    return (): void => {
      ipcRenderer.removeListener('processes-updated', handler)
    }
  },
  approve: (id: string) => ipcRenderer.invoke('approve', id),
  reject: (id: string) => ipcRenderer.invoke('reject', id),
  bulkApprove: () => ipcRenderer.invoke('bulk-approve'),
  rename: (id: string, newName: string) => ipcRenderer.invoke('rename', id, newName),
  setAutoApprove: (id: string, enabled: boolean) => ipcRenderer.invoke('set-auto-approve', id, enabled)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
