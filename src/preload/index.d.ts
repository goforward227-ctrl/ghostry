export interface ClaudeProcessDTO {
  id: string
  pid: number
  status: 'approval' | 'running' | 'done'
  name: string
  message: string
  lastTimestamp: number
}

export interface CCBuddyAPI {
  onProcessesUpdated: (callback: (processes: ClaudeProcessDTO[]) => void) => void
  approve: (id: string) => Promise<{ success: boolean; error?: string }>
  reject: (id: string) => Promise<{ success: boolean; error?: string }>
  bulkApprove: () => Promise<{ approved: number; failed: number }>
}

declare global {
  interface Window {
    api: CCBuddyAPI
  }
}
