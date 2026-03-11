import { EventEmitter } from 'events'
import * as pty from 'node-pty'

export class PtyRunner extends EventEmitter {
  private ptyProcess: pty.IPty

  constructor(command: string, args: string[], cwd: string) {
    super()

    this.ptyProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      cwd,
      env: process.env as Record<string, string>
    })

    // Forward PTY output to real stdout and emit for monitoring
    this.ptyProcess.onData((data: string) => {
      process.stdout.write(data)
      this.emit('data', data)
    })

    // Forward real stdin to PTY (raw mode so Ctrl+C etc. pass through)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()
    process.stdin.on('data', (data: Buffer) => {
      this.ptyProcess.write(data.toString())
    })

    // Handle terminal resize
    process.stdout.on('resize', () => {
      this.ptyProcess.resize(
        process.stdout.columns || 80,
        process.stdout.rows || 24
      )
    })

    // Handle PTY exit
    this.ptyProcess.onExit(({ exitCode, signal }) => {
      this.emit('exit', exitCode, signal)
    })
  }

  write(text: string): void {
    this.ptyProcess.write(text)
  }

  kill(signal?: string): void {
    this.ptyProcess.kill(signal)
  }
}
