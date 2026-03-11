export interface ClaudeProcessDTO {
  id: string
  pid: number
  status: 'approval' | 'input' | 'running' | 'idle' | 'done'
  name: string
  message: string
  lastTimestamp: number
}

export interface GhostrideAPI {
  onProcessesUpdated: (callback: (processes: ClaudeProcessDTO[]) => void) => void
  approve: (id: string) => Promise<{ success: boolean; error?: string }>
  reject: (id: string) => Promise<{ success: boolean; error?: string }>
  bulkApprove: () => Promise<{ approved: number; failed: number }>
  rename: (id: string, newName: string) => Promise<boolean>
}

declare global {
  interface Window {
    api: GhostrideAPI
  }
}
