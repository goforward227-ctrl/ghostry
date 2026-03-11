import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import type { ScanResult } from './types'

export class ProcessScanner extends EventEmitter {
  private interval: ReturnType<typeof setInterval> | null = null

  start(intervalMs = 3000): void {
    this.scan()
    this.interval = setInterval(() => this.scan(), intervalMs)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  scan(): void {
    execFile('ps', ['-eo', 'pid,tty,comm'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        this.emit('processes', [])
        return
      }

      const myPid = process.pid
      const lines = stdout.trim().split('\n').slice(1) // skip header
      const claudeProcesses: { pid: number; tty: string }[] = []

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 3) continue
        const pid = parseInt(parts[0], 10)
        const tty = parts[1]
        const comm = parts.slice(2).join(' ')

        if (
          comm.endsWith('claude') &&
          pid !== myPid &&
          tty !== '??' &&
          tty !== '-'
        ) {
          claudeProcesses.push({ pid, tty })
        }
      }

      // Get CWD for each process
      const results: ScanResult[] = []
      let pending = claudeProcesses.length

      if (pending === 0) {
        this.emit('processes', [])
        return
      }

      for (const proc of claudeProcesses) {
        execFile(
          'lsof',
          ['-a', '-p', String(proc.pid), '-d', 'cwd', '-Fn'],
          { timeout: 3000 },
          (lsofErr, lsofStdout) => {
            if (!lsofErr && lsofStdout) {
              const lines = lsofStdout.split('\n')
              for (const l of lines) {
                if (l.startsWith('n/')) {
                  results.push({
                    pid: proc.pid,
                    cwd: l.slice(1),
                    tty: proc.tty
                  })
                  break
                }
              }
            }

            pending--
            if (pending === 0) {
              this.emit('processes', results)
            }
          }
        )
      }
    })
  }
}
