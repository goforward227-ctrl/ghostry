export const STATUS_DIR = '/tmp/ccbuddy'

export interface StatusFile {
  pid: number
  cwd: string
  name: string
  status: 'running' | 'approval' | 'idle'
  message: string
  timestamp: number
  socketPath: string
}

export interface SocketRequest {
  type: 'approve' | 'reject'
}

export interface SocketResponse {
  success: boolean
  error?: string
}
