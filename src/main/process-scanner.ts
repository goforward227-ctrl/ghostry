import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import type { ScanResult } from './types'

// Ensure UTF-8 encoding for child processes (important when launched from GUI)
const UTF8_ENV = {
  ...process.env,
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8'
}

// lsof escapes non-ASCII bytes as \xNN in some environments
// This function converts them back to actual UTF-8 bytes
// If the string doesn't contain escape sequences, return as-is
function unescapeLsofPath(str: string): string {
  // Check if the string contains \xNN escape sequences
  if (!str.includes('\\x')) {
    // No escape sequences - return as-is (already valid UTF-8)
    return str
  }

  // Replace \xNN sequences with actual bytes
  const bytes: number[] = []
  let i = 0
  while (i < str.length) {
    if (str[i] === '\\' && str[i + 1] === 'x' && i + 4 <= str.length) {
      const hex = str.slice(i + 2, i + 4)
      const byte = parseInt(hex, 16)
      if (!isNaN(byte)) {
        bytes.push(byte)
        i += 4
        continue
      }
    }
    // For non-escape characters, convert to UTF-8 bytes properly
    const char = str[i]
    const encoded = Buffer.from(char, 'utf8')
    for (const b of encoded) {
      bytes.push(b)
    }
    i++
  }
  return Buffer.from(bytes).toString('utf8')
}

export class ProcessScanner extends EventEmitter {
  private interval: ReturnType<typeof setInterval> | null = null

  start(intervalMs = 3000): void {
    if (this.interval) return // Already running
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
    execFile('/bin/ps', ['-eo', 'pid,tty,comm'], { timeout: 5000, env: UTF8_ENV, encoding: 'utf8' }, (err, stdout) => {
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
          '/usr/sbin/lsof',
          ['-a', '-p', String(proc.pid), '-d', 'cwd', '-Fn'],
          { timeout: 3000, env: UTF8_ENV, encoding: 'utf8' },
          (lsofErr, lsofStdout) => {
            if (!lsofErr && lsofStdout) {
              const lines = lsofStdout.split('\n')
              for (const l of lines) {
                if (l.startsWith('n/')) {
                  // Unescape \xNN sequences that lsof uses for non-ASCII chars
                  const rawPath = l.slice(1)
                  const cwd = unescapeLsofPath(rawPath)
                  results.push({
                    pid: proc.pid,
                    cwd,
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
