import * as fs from 'fs'
import { homedir } from 'os'
import { join, basename } from 'path'
import type { SessionInfo, ProcessStatus } from './types'

const TAIL_BYTES = 65536 // 64KB
const HEAD_BYTES = 8192 // 8KB

interface JsonlEntry {
  type: 'user' | 'assistant' | 'result'
  message?: {
    role?: string
    content?: unknown[]
  }
  cwd?: string
}

function readTailLines(filePath: string, bytes: number): string[] {
  try {
    const stat = fs.statSync(filePath)
    const size = stat.size
    const start = Math.max(0, size - bytes)
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(Math.min(bytes, size))
    fs.readSync(fd, buf, 0, buf.length, start)
    fs.closeSync(fd)
    return buf.toString('utf-8').split('\n').filter((l) => l.trim())
  } catch {
    return []
  }
}

function readHeadLines(filePath: string, bytes: number): string[] {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(bytes)
    const bytesRead = fs.readSync(fd, buf, 0, bytes, 0)
    fs.closeSync(fd)
    return buf.slice(0, bytesRead).toString('utf-8').split('\n').filter((l) => l.trim())
  } catch {
    return []
  }
}

function parseEntries(lines: string[]): JsonlEntry[] {
  const entries: JsonlEntry[] = []
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line))
    } catch {
      // Skip incomplete lines
    }
  }
  return entries
}

function detectStatus(entries: JsonlEntry[], isAlive: boolean): ProcessStatus {
  if (!isAlive) return 'done'

  // Find last assistant entry with tool_use
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry.type === 'assistant' && entry.message?.content) {
      const content = entry.message.content as Array<{ type: string }>
      if (content.length > 0) {
        const lastBlock = content[content.length - 1]
        if (lastBlock.type === 'tool_use') {
          // Check if there's a tool_result after this assistant entry
          for (let j = i + 1; j < entries.length; j++) {
            const later = entries[j]
            if (later.type === 'user' && Array.isArray(later.message?.content)) {
              const blocks = later.message!.content as Array<{ type: string }>
              if (blocks.some((b) => b.type === 'tool_result')) return 'running'
            }
          }
          return 'approval'
        }
        // If last block is text/thinking, it's running (not waiting for approval)
        if (lastBlock.type === 'text' || lastBlock.type === 'thinking') {
          return 'running'
        }
      }
    }
  }

  return 'running'
}

function extractMessage(entries: JsonlEntry[]): string {
  // Scan last 10 entries for text content
  const recent = entries.slice(-10)
  for (let i = recent.length - 1; i >= 0; i--) {
    const entry = recent[i]
    if (entry.message?.content && Array.isArray(entry.message.content)) {
      for (let j = (entry.message.content as unknown[]).length - 1; j >= 0; j--) {
        const block = (entry.message.content as Array<{ type: string; text?: string; name?: string }>)[j]
        if (block.type === 'text' && block.text) {
          return block.text.slice(0, 120)
        }
        if (block.type === 'tool_use' && block.name) {
          return `Tool: ${block.name}`
        }
      }
    }
  }
  return ''
}

export function findSessionForCwd(
  cwd: string
): { sessionId: string; filePath: string } | null {
  const claudeDir = join(homedir(), '.claude', 'projects')

  try {
    const projectDirs = fs.readdirSync(claudeDir)
    // Sort by most recently modified
    const sorted = projectDirs
      .map((d) => {
        const dirPath = join(claudeDir, d)
        try {
          return { name: d, path: dirPath, mtime: fs.statSync(dirPath).mtimeMs }
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => b!.mtime - a!.mtime) as Array<{
      name: string
      path: string
      mtime: number
    }>

    for (const dir of sorted) {
      const files = fs
        .readdirSync(dir.path)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => {
          const fp = join(dir.path, f)
          try {
            return { name: f, path: fp, mtime: fs.statSync(fp).mtimeMs }
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .sort((a, b) => b!.mtime - a!.mtime) as Array<{
        name: string
        path: string
        mtime: number
      }>

      for (const file of files) {
        const headLines = readHeadLines(file.path, HEAD_BYTES)
        const headEntries = parseEntries(headLines)
        for (const entry of headEntries) {
          if (entry.cwd === cwd) {
            return {
              sessionId: file.name.replace('.jsonl', ''),
              filePath: file.path
            }
          }
        }
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  return null
}

export function parseSession(
  filePath: string,
  isProcessAlive: boolean
): SessionInfo | null {
  try {
    const tailLines = readTailLines(filePath, TAIL_BYTES)
    const entries = parseEntries(tailLines)
    if (entries.length === 0) return null

    const status = detectStatus(entries, isProcessAlive)
    const message = extractMessage(entries)
    const stat = fs.statSync(filePath)

    return {
      sessionId: basename(filePath, '.jsonl'),
      filePath,
      cwd: '',
      status,
      message,
      lastTimestamp: stat.mtimeMs
    }
  } catch {
    return null
  }
}
