import { contextBridge, ipcRenderer } from 'electron'

export interface GhostrideAPI {
  onProcessesUpdated: (callback: (processes: ClaudeProcessDTO[]) => void) => void
  approve: (id: string) => Promise<{ success: boolean; error?: string }>
  reject: (id: string) => Promise<{ success: boolean; error?: string }>
  bulkApprove: () => Promise<{ approved: number; failed: number }>
  rename: (id: string, newName: string) => Promise<boolean>
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
    ipcRenderer.removeAllListeners('processes-updated')
    ipcRenderer.on('processes-updated', (_event, processes) => {
      callback(processes)
    })
  },
  approve: (id: string) => ipcRenderer.invoke('approve', id),
  reject: (id: string) => ipcRenderer.invoke('reject', id),
  bulkApprove: () => ipcRenderer.invoke('bulk-approve'),
  rename: (id: string, newName: string) => ipcRenderer.invoke('rename', id, newName)
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
