import chokidar from 'chokidar'
import { EventEmitter } from 'events'
import { homedir } from 'os'
import { join } from 'path'

export class SessionWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null

  start(): void {
    const claudeDir = join(homedir(), '.claude', 'projects')

    this.watcher = chokidar.watch(join(claudeDir, '**/*.jsonl'), {
      persistent: true,
      ignoreInitial: true,
      depth: 1,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    })

    this.watcher.on('change', (filePath) => {
      const sessionId = filePath.split('/').pop()?.replace('.jsonl', '') || ''
      this.emit('session-changed', sessionId, filePath)
    })

    this.watcher.on('add', (filePath) => {
      const sessionId = filePath.split('/').pop()?.replace('.jsonl', '') || ''
      this.emit('session-added', sessionId, filePath)
    })
  }

  stop(): void {
    this.watcher?.close()
  }
}
