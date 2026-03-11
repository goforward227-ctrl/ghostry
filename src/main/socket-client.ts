import * as net from 'net'
import type { SocketRequest, SocketResponse } from '../shared/protocol'

export class SocketClient {
  static send(socketPath: string, request: SocketRequest): Promise<SocketResponse> {
    return new Promise((resolve) => {
      const client = net.createConnection(socketPath)
      const timeout = setTimeout(() => {
        client.destroy()
        resolve({ success: false, error: 'Socket timeout' })
      }, 5000)

      client.on('connect', () => {
        client.write(JSON.stringify(request) + '\n')
      })

      let buf = ''
      client.on('data', (data) => {
        buf += data.toString()
        const idx = buf.indexOf('\n')
        if (idx !== -1) {
          clearTimeout(timeout)
          client.end()
          try {
            resolve(JSON.parse(buf.slice(0, idx)))
          } catch {
            resolve({ success: false, error: 'Invalid response' })
          }
        }
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        resolve({ success: false, error: err.message })
      })
    })
  }
}
