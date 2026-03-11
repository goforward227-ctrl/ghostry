import { exec } from 'child_process'

// Validate TTY name to prevent AppleScript injection
const TTY_PATTERN = /^ttys[0-9]+$/

export class ApprovalHandler {
  async approve(tty: string): Promise<{ success: boolean; error?: string }> {
    return this.sendToTerminal(tty, '1')
  }

  async reject(tty: string): Promise<{ success: boolean; error?: string }> {
    return this.sendToTerminal(tty, '\x1b')
  }

  private async sendToTerminal(
    tty: string,
    text: string
  ): Promise<{ success: boolean; error?: string }> {
    // Validate TTY format to prevent injection
    if (!TTY_PATTERN.test(tty)) {
      return { success: false, error: 'Invalid TTY device format' }
    }

    const ttyDevice = `/dev/${tty}`

    // Try iTerm2 first, then Terminal.app
    if (await this.sendViaITerm2(ttyDevice, text)) return { success: true }
    if (await this.sendViaTerminalApp(ttyDevice, text)) return { success: true }

    return {
      success: false,
      error: 'Could not send input. Supported terminals: iTerm2, Terminal.app'
    }
  }

  private runOsascript(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const escaped = script.replace(/'/g, "'\\''")
      exec(`/usr/bin/osascript -e '${escaped}'`, { encoding: 'utf-8', timeout: 5000 }, (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout.trim())
      })
    })
  }

  private async sendViaITerm2(ttyDevice: string, text: string): Promise<boolean> {
    const script = `
      tell application "System Events"
        if not (exists process "iTerm2") then return false
      end tell
      tell application "iTerm2"
        repeat with w in windows
          repeat with t in tabs of w
            repeat with s in sessions of t
              if tty of s is "${ttyDevice}" then
                tell s to write text "${text}" newline no
                return true
              end if
            end repeat
          end repeat
        end repeat
      end tell
      return false
    `
    try {
      const result = await this.runOsascript(script)
      console.log('[ApprovalHandler] iTerm2 result:', result, 'tty:', ttyDevice)
      return result === 'true'
    } catch (err) {
      console.log('[ApprovalHandler] iTerm2 error:', err)
      return false
    }
  }

  private async sendViaTerminalApp(ttyDevice: string, text: string): Promise<boolean> {
    const script = `
      tell application "System Events"
        if not (exists process "Terminal") then return false
      end tell
      tell application "Terminal"
        repeat with w in windows
          repeat with t in tabs of w
            if tty of t is "${ttyDevice}" then
              set selected of t to true
              set frontmost of w to true
              tell application "System Events"
                keystroke "${text}"
                key code 36
              end tell
              return true
            end if
          end repeat
        end repeat
      end tell
      return false
    `
    try {
      const result = await this.runOsascript(script)
      console.log('[ApprovalHandler] Terminal.app result:', result, 'tty:', ttyDevice)
      return result === 'true'
    } catch (err) {
      console.log('[ApprovalHandler] Terminal.app error:', err)
      return false
    }
  }
}
