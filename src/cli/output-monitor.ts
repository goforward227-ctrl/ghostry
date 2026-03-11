import { EventEmitter } from 'events'

export type MonitorStatus = 'running' | 'approval' | 'idle'

// ANSI escape sequence pattern (covers CSI, OSC, character set sequences)
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]|\x1b\[[\d;]*m/g

// Approval prompt patterns for Claude Code
const APPROVAL_PATTERNS = [
  /\(Y\/?n\)/,
  /\(y\/?N\)/,
  /Do you want to (?:proceed|allow|continue)/i,
  /Allow .+ to run/i,
  /Press Enter to confirm/i
]

const BUFFER_MAX = 4096
const IDLE_TIMEOUT_MS = 5000

export class OutputMonitor extends EventEmitter {
  private buffer = ''
  private status: MonitorStatus = 'running'
  private noOutputTimer: ReturnType<typeof setTimeout> | null = null
  private latestMessage = ''

  feed(data: string): void {
    const stripped = data.replace(ANSI_RE, '')
    this.buffer += stripped

    // Keep buffer bounded
    if (this.buffer.length > BUFFER_MAX) {
      this.buffer = this.buffer.slice(-BUFFER_MAX)
    }

    this.resetNoOutputTimer()
    this.detectStatus()
  }

  clearBuffer(): void {
    this.buffer = ''
  }

  getStatus(): MonitorStatus {
    return this.status
  }

  getMessage(): string {
    return this.latestMessage
  }

  private detectStatus(): void {
    const lines = this.buffer.split('\n')
    const recentLines = lines.slice(-20)
    const recentText = recentLines.join('\n')

    const wasApproval = this.status === 'approval'
    let isApproval = false

    for (const pattern of APPROVAL_PATTERNS) {
      if (pattern.test(recentText)) {
        isApproval = true
        break
      }
    }

    if (isApproval && !wasApproval) {
      this.setStatus('approval')
    } else if (!isApproval && wasApproval) {
      this.setStatus('running')
    } else if (!isApproval && this.status === 'idle') {
      // New output arrived while idle → back to running
      this.setStatus('running')
    }

    // Extract latest meaningful line as message
    for (let i = recentLines.length - 1; i >= 0; i--) {
      const line = recentLines[i].trim()
      if (line.length > 3) {
        this.latestMessage = line.slice(0, 120)
        break
      }
    }
  }

  private setStatus(newStatus: MonitorStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus
      this.emit('status-change', newStatus, this.latestMessage)
    }
  }

  private resetNoOutputTimer(): void {
    if (this.noOutputTimer) clearTimeout(this.noOutputTimer)
    this.noOutputTimer = setTimeout(() => {
      if (this.status === 'running') {
        this.setStatus('idle')
      }
    }, IDLE_TIMEOUT_MS)
  }

  destroy(): void {
    if (this.noOutputTimer) clearTimeout(this.noOutputTimer)
  }
}
