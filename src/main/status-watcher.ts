import chokidar from 'chokidar'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { STATUS_DIR } from '../shared/protocol'
import type { StatusFile } from '../shared/protocol'

export class StatusWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null

  start(): void {
    // Ensure directory exists for watching
    fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 })

    this.watcher = chokidar.watch(path.join(STATUS_DIR, '*.json'), {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    })

    const update = (): void => {
      const statuses = this.readAllStatusFiles()
      this.emit('processes', statuses)
    }

    this.watcher.on('add', update)
    this.watcher.on('change', update)
    this.watcher.on('unlink', update)
  }

  private readAllStatusFiles(): StatusFile[] {
    try {
      const files = fs.readdirSync(STATUS_DIR).filter((f) => f.endsWith('.json'))
      const results: StatusFile[] = []

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(STATUS_DIR, file), 'utf-8')
          const status: StatusFile = JSON.parse(content)

          // Verify PID is still alive
          try {
            process.kill(status.pid, 0)
          } catch {
            // PID dead, clean up stale files
            try {
              fs.unlinkSync(path.join(STATUS_DIR, file))
            } catch {
              /* ignore */
            }
            try {
              fs.unlinkSync(status.socketPath)
            } catch {
              /* ignore */
            }
            continue
          }

          results.push(status)
        } catch {
          // Ignore corrupt/partial files
        }
      }

      return results
    } catch {
      return []
    }
  }

  stop(): void {
    this.watcher?.close()
  }
}
