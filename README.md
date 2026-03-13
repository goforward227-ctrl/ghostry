# Ghostry

A macOS menu bar app that monitors your running [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions and lets you approve or reject tool-use prompts with a single click.

![Ghostry Screenshot](docs/screenshot.png)

## Why?

When running multiple Claude Code sessions, you constantly switch between terminal tabs to approve tool executions. Ghostry sits in your menu bar, shows all pending approvals in one place, and lets you handle them instantly.

## Features

### Auto-detect Claude Code sessions

No setup required. Ghostry automatically scans for running `claude` processes every 1.5 seconds and reads session data from `~/.claude/projects/` to determine their status.

### One-click approve / reject

When Claude Code asks for tool-use approval, the session appears in Ghostry with an **Approve** button. Clicking it sends the approval keystroke directly to the correct terminal tab via AppleScript — no need to find and switch to that terminal. You can also **Reject** from the three-dot menu to send Escape.

### Bulk approve

The **Approve All** button (or right-click the menu bar icon → Approve All) approves every pending prompt at once across all sessions.

### Auto-approve mode

Enable per-project automatic approval by toggling the **Auto** button next to each session. When enabled:
- Approval prompts are instantly accepted without user interaction
- Desktop notifications are skipped for that project
- The setting persists across app restarts

### Desktop notifications

Ghostry sends native macOS notifications when a session needs attention:
- **Approval required** — a tool-use prompt is waiting. Click the **Approve** button in the notification to approve directly, or click the notification body to open Ghostry.
- **Waiting for input** — Claude is asking a question via `AskUserQuestion`. Click the notification to open Ghostry and respond in your terminal.

Notifications are sent once per event (no repeated alerts) and are skipped for auto-approved projects.

### Real-time status overview

Each session shows a colored status indicator:

| Status | Meaning | Indicator |
|--------|---------|-----------|
| **Pending** | Waiting for tool-use approval | Orange dot |
| **Input** | Claude is asking for user input | Orange dot |
| **Running** | Actively processing | Black pulsing dot |
| **Idle** | Process alive, no activity for 10+ sec | Gray dot |
| **Done** | Process has exited | Light gray dot |

The menu bar icon shows a badge when any session is pending approval.

### Custom project names

Click any project name to rename it inline. Names are persisted across restarts in `project-names.json`. If no custom name is set, the working directory name is used.

### Tabs

- **All** — shows every detected session
- **Pending** — shows only sessions waiting for approval (with a count badge)

### Language support

English and Japanese. Auto-detected from your OS language, or manually switch via the dropdown in the header. Your choice is saved.

## Requirements

- **macOS** (uses AppleScript for terminal interaction)
- **iTerm2** or **Terminal.app**
- **Claude Code** CLI installed and running

## Install

### Homebrew (Recommended)

```bash
brew tap goforward227-ctrl/ghostry
brew install ghostry
```

### Download

Download the latest `.zip` from [Releases](https://github.com/goforward227-ctrl/ghostry/releases).

> **Note:** The app is not notarized with Apple. macOS may block it on first launch.
>
> **To open:**
> 1. **Right-click** the app → **Open** → Click **Open** in the dialog
> 2. If still blocked: **System Settings → Privacy & Security** → scroll down → **Open Anyway**

### Build from Source

```bash
git clone https://github.com/goforward227-ctrl/ghostry.git
cd ghostry
npm install
npm run build:mac
```

## Development

```bash
npm install
npm run dev
```

## How to Use

1. Start Ghostry — it appears as a ghost icon in your menu bar
2. Run `claude` in your terminal(s) as usual
3. Click the menu bar icon to see all detected sessions and their status
4. When Claude Code asks for approval, you can:
   - Click **Approve** in the Ghostry window
   - Click **Approve** in the desktop notification
   - Use **Approve All** to approve everything at once
5. To auto-approve a project, toggle the **Auto** button next to it

## Supported Terminals

| Terminal | Status |
|----------|--------|
| iTerm2 | Supported |
| Terminal.app | Supported |
| Warp | Not yet |
| Kitty / Alacritty | Not yet |

## Limitations

- macOS only (AppleScript dependency)
- When you select "Yes, allow all" in Claude Code for a specific action type, those prompts won't appear in Ghostry (Claude Code handles them automatically)

## License

[MIT](LICENSE)
