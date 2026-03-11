import * as fs from 'fs'
import * as path from 'path'
import { STATUS_DIR } from '../shared/protocol'
import type { StatusFile } from '../shared/protocol'

export class StatusFileManager {
  private filePath: string
  private data: StatusFile

  constructor(pid: number, cwd: string, socketPath: string) {
    // Create status directory with restricted permissions (rwx------)
    fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 })

    this.filePath = path.join(STATUS_DIR, `${pid}.json`)
    this.data = {
      pid,
      cwd,
      name: path.basename(cwd),
      status: 'running',
      message: '',
      timestamp: Date.now(),
      socketPath
    }
    this.write()
  }

  update(partial: Partial<Pick<StatusFile, 'status' | 'message'>>): void {
    Object.assign(this.data, partial, { timestamp: Date.now() })
    this.write()
  }

  private write(): void {
    // Atomic write: write to .tmp then rename
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    fs.renameSync(tmp, this.filePath)
  }

  cleanup(): void {
    try {
      fs.unlinkSync(this.filePath)
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(this.filePath + '.tmp')
    } catch {
      // ignore
    }
  }
}
