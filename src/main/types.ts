export type ProcessStatus = 'approval' | 'input' | 'running' | 'idle' | 'done'

export interface ClaudeProcess {
  id: string // sessionId
  pid: number
  cwd: string
  tty: string
  status: ProcessStatus
  name: string // project name derived from cwd basename
  message: string
  lastTimestamp: number
}

export interface ScanResult {
  pid: number
  cwd: string
  tty: string
}

export interface SessionInfo {
  sessionId: string
  filePath: string
  cwd: string
  status: ProcessStatus
  message: string
  lastTimestamp: number
}
