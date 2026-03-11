#!/usr/bin/env node

import * as path from 'path'
import * as fs from 'fs'
import { execFileSync } from 'child_process'
import { STATUS_DIR } from '../shared/protocol'
import type { SocketRequest, SocketResponse } from '../shared/protocol'
import { PtyRunner } from './pty-runner'
import { OutputMonitor } from './output-monitor'
import { SocketServer } from './socket-server'
import { StatusFileManager } from './status-file'

const pid = process.pid
const cwd = process.cwd()
const args = process.argv.slice(2)

// Non-TTY mode: just exec claude directly (e.g. piped usage)
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  try {
    execFileSync('claude', args, { stdio: 'inherit', cwd })
  } catch (e: unknown) {
    const err = e as { status?: number }
    process.exit(err.status ?? 1)
  }
  process.exit(0)
}

// Ensure status directory exists
fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 })

const socketPath = path.join(STATUS_DIR, `${pid}.sock`)

// Start PTY with claude
const runner = new PtyRunner('claude', args, cwd)
const monitor = new OutputMonitor()
const statusFile = new StatusFileManager(pid, cwd, socketPath)

// Wire PTY output to monitor
runner.on('data', (data: string) => {
  monitor.feed(data)
})

// Wire monitor status changes to status file
monitor.on('status-change', (status: string, message: string) => {
  statusFile.update({ status: status as 'running' | 'approval' | 'idle', message })
})

// Socket server: handle approve/reject commands
const socketServer = new SocketServer(socketPath, (req: SocketRequest): SocketResponse => {
  if (req.type === 'approve') {
    runner.write('y')
    // Clear buffer to avoid re-detecting the old approval prompt
    monitor.clearBuffer()
    return { success: true }
  }
  if (req.type === 'reject') {
    runner.write('n')
    monitor.clearBuffer()
    return { success: true }
  }
  return { success: false, error: 'Unknown command' }
})

// Cleanup function
let cleaned = false
function cleanup(): void {
  if (cleaned) return
  cleaned = true
  try {
    process.stdin.setRawMode(false)
  } catch {
    // ignore
  }
  monitor.destroy()
  socketServer.close()
  statusFile.cleanup()
}

// PTY exit → cleanup and exit with same code
runner.on('exit', (exitCode: number) => {
  cleanup()
  process.exit(exitCode ?? 0)
})

// Signal handlers for graceful shutdown
process.on('SIGTERM', () => {
  cleanup()
  process.exit(143)
})
process.on('SIGHUP', () => {
  cleanup()
  process.exit(129)
})
// Note: SIGINT is NOT handled here because stdin is in raw mode.
// Ctrl+C bytes (\x03) flow through stdin → PTY → claude handles it.
// If claude exits, the 'exit' event above handles cleanup.

process.on('exit', () => {
  cleanup()
})
