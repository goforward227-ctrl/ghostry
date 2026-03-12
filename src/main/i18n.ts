import { app } from 'electron'

interface Translations {
  approvalRequired: string
  waitingForInput: string
  approve: string
}

const translations: Record<string, Translations> = {
  en: {
    approvalRequired: 'Approval required',
    waitingForInput: 'Waiting for your input',
    approve: 'Approve'
  },
  ja: {
    approvalRequired: '承認が必要です',
    waitingForInput: '入力を待っています',
    approve: '承認'
  }
}

function detectLocale(): string {
  const lang = app.getLocale().slice(0, 2)
  if (lang in translations) return lang
  return 'en'
}

export function t(): Translations {
  return translations[detectLocale()]
}
