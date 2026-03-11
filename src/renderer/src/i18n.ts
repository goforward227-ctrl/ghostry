const translations = {
  en: {
    headerTitle: 'All Notifications',
    processCount: (n: number) => `${n} process${n !== 1 ? 'es' : ''}`,
    tabAll: 'All',
    tabPending: 'Pending',
    bulkApprove: 'Approve All',
    emptyPending: 'No pending approvals',
    emptyAll: 'No processes',
    approve: 'Approve',
    sending: 'Sending...',
    reject: 'Reject',
    approvalFailed: 'Approval failed',
    commError: 'Communication error',
    statusApproval: 'Pending',
    statusInput: 'Waiting for input',
    statusRunning: 'Running',
    statusIdle: 'Idle',
    statusDone: 'Done',
    justNow: 'just now',
    secondsAgo: (n: number) => `${n}s ago`,
    minutesAgo: (n: number) => `${n}m ago`,
    hoursAgo: (n: number) => `${n}h ago`
  },
  ja: {
    headerTitle: 'すべての通知',
    processCount: (n: number) => `${n}プロセス`,
    tabAll: 'すべて',
    tabPending: '承認待ち',
    bulkApprove: '一括承認',
    emptyPending: '承認待ちはありません',
    emptyAll: 'プロセスなし',
    approve: '承認',
    sending: '送信中...',
    reject: '却下',
    approvalFailed: '承認に失敗しました',
    commError: '通信エラー',
    statusApproval: '承認待ち',
    statusInput: '入力待ち',
    statusRunning: '実行中',
    statusIdle: '待機中',
    statusDone: '完了',
    justNow: 'たった今',
    secondsAgo: (n: number) => `${n}秒前`,
    minutesAgo: (n: number) => `${n}分前`,
    hoursAgo: (n: number) => `${n}時間前`
  }
} as const

export type Locale = keyof typeof translations
export type Translations = typeof translations['en']

function detectLocale(): Locale {
  const lang = navigator.language.slice(0, 2)
  if (lang in translations) return lang as Locale
  return 'en'
}

let currentLocale: Locale = detectLocale()
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale): void {
  currentLocale = locale
  localStorage.setItem('ghostride-locale', locale)
  listeners.forEach((fn) => fn())
}

export function t(): Translations {
  return translations[currentLocale]
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Restore saved preference
const saved = localStorage.getItem('ghostride-locale')
if (saved && saved in translations) {
  currentLocale = saved as Locale
}
