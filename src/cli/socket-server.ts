import * as net from 'net'
import * as fs from 'fs'
import type { SocketRequest, SocketResponse } from '../shared/protocol'

export class SocketServer {
  private server: net.Server
  private socketPath: string

  constructor(
    socketPath: string,
    onCommand: (req: SocketRequest) => SocketResponse
  ) {
    this.socketPath = socketPath

    // Clean up stale socket
    try {
      fs.unlinkSync(this.socketPath)
    } catch {
      // ignore
    }

    this.server = net.createServer((conn) => {
      let buf = ''
      conn.on('data', (data) => {
        buf += data.toString()
        let idx: number
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx)
          buf = buf.slice(idx + 1)
          try {
            const req: SocketRequest = JSON.parse(line)
            const res = onCommand(req)
            conn.write(JSON.stringify(res) + '\n')
          } catch {
            conn.write(JSON.stringify({ success: false, error: 'Parse error' } satisfies SocketResponse) + '\n')
          }
        }
      })

      conn.on('error', () => {
        // Client disconnected unexpectedly, ignore
      })
    })

    this.server.on('error', (err) => {
      console.error('[SocketServer] error:', err.message)
    })

    this.server.listen(this.socketPath)
  }

  close(): void {
    this.server.close()
    try {
      fs.unlinkSync(this.socketPath)
    } catch {
      // ignore
    }
  }
}
