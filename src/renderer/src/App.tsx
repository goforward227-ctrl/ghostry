import { useState, useEffect, useCallback, useRef } from 'react'
import type { ClaudeProcessDTO } from '../../preload/index.d'
import { t, getLocale, setLocale, onLocaleChange, type Locale } from './i18n'
import './App.css'

const SPINNER_FRAMES = ['·', '✢', '✶', '✻', '⏺', '✻', '✢', '·']

function Spinner({ color }: { color: string }): React.ReactNode {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 150)
    return (): void => clearInterval(id)
  }, [])
  return (
    <span style={{ color, fontSize: 10, lineHeight: 1, flexShrink: 0, width: 10, textAlign: 'center', display: 'inline-block' }}>
      {SPINNER_FRAMES[frame]}
    </span>
  )
}

type TabType = 'all' | 'pending'

const statusColors = {
  approval: { color: '#DF755D', dotColor: '#DF755D', pulse: false },
  input: { color: '#DF755D', dotColor: '#DF755D', pulse: false },
  running: { color: '#1d1d1f', dotColor: '#1d1d1f', pulse: true },
  idle: { color: '#aeaeb2', dotColor: '#c7c7cc', pulse: false },
  done: { color: '#c7c7cc', dotColor: '#d1d1d6', pulse: false }
}

const statusLabelKey = {
  approval: 'statusApproval',
  input: 'statusInput',
  running: 'statusRunning',
  idle: 'statusIdle',
  done: 'statusDone'
} as const

function formatElapsed(timestampMs: number): string {
  const i = t()
  const diffSec = Math.floor((Date.now() - timestampMs) / 1000)
  if (diffSec < 10) return i.justNow
  if (diffSec < 60) return i.secondsAgo(diffSec)
  if (diffSec < 3600) return i.minutesAgo(Math.floor(diffSec / 60))
  return i.hoursAgo(Math.floor(diffSec / 3600))
}

function App(): React.ReactNode {
  const [processes, setProcesses] = useState<ClaudeProcessDTO[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const [locale, setLocaleState] = useState<Locale>(getLocale())
  const [, setTick] = useState(0)

  const i = t()

  useEffect(() => {
    return onLocaleChange(() => setLocaleState(getLocale()))
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000)
    return (): void => clearInterval(interval)
  }, [])

  useEffect(() => {
    window.api.onProcessesUpdated((data) => {
      setProcesses(data)
    })
  }, [])

  const approve = useCallback(async (id: string) => {
    setLoading(id)
    setError(null)
    try {
      const result = await window.api.approve(id)
      if (!result.success) {
        setError(result.error || t().approvalFailed)
      }
    } catch {
      setError(t().commError)
    } finally {
      setLoading(null)
      setOpenMenu(null)
    }
  }, [])

  const reject = useCallback(async (id: string) => {
    setLoading(id)
    setError(null)
    try {
      await window.api.reject(id)
    } catch {
      setError(t().commError)
    } finally {
      setLoading(null)
      setOpenMenu(null)
    }
  }, [])

  const bulkApprove = useCallback(async () => {
    await window.api.bulkApprove()
  }, [])

  const approvalCount = processes.filter((p) => p.status === 'approval').length

  const filtered = processes.filter((p) => {
    if (activeTab === 'pending') return p.status === 'approval'
    return true
  })

  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
        background: '#ffffff',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px 12px',
            borderBottom: '1px solid #ebebf0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#1d1d1f', fontWeight: 700, fontSize: 15 }}>
              {i.headerTitle}
            </span>
            <span style={{ fontSize: 11, color: '#aeaeb2', fontWeight: 700 }}>
              {i.processCount(processes.length)}
            </span>
          </div>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
              background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='4'%3E%3Cpath d='M0 0l3 4 3-4z' fill='%23aeaeb2'/%3E%3C/svg%3E") no-repeat right 4px center`,
              border: '1px solid #e0e0e8',
              borderRadius: 4,
              padding: '3px 14px 3px 6px',
              fontSize: 12,
              color: '#6e6e73',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            <option value="en">EN</option>
            <option value="ja">JA</option>
          </select>
        </div>

        {/* Tabs + Bulk */}
        <div
          style={{
            padding: '0 18px',
            borderBottom: '1px solid #ebebf0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex' }}>
            {([
              { key: 'all' as TabType, label: i.tabAll },
              { key: 'pending' as TabType, label: i.tabPending }
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '10px 12px',
                  fontSize: 12,
                  color: activeTab === tab.key ? '#1d1d1f' : '#6e6e73',
                  borderBottom:
                    activeTab === tab.key ? '2px solid #1d1d1f' : '2px solid transparent',
                  fontFamily: 'inherit',
                  transition: 'color 0.15s'
                }}
              >
                {tab.label}
                {tab.key === 'pending' && approvalCount > 0 && (
                  <span
                    style={{
                      marginLeft: 5,
                      background: '#DF755D',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '1px 5px 0 4px',
                      fontSize: 9,
                      fontWeight: 700,
                      lineHeight: '16px',
                      height: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 16,
                      verticalAlign: 'middle'
                    }}
                  >
                    {approvalCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          {approvalCount > 0 && (
            <button
              onClick={bulkApprove}
              style={{
                background: '#DF755D',
                border: 'none',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              {i.bulkApprove}
            </button>
          )}
        </div>

        {/* Error bar */}
        {error && (
          <div
            style={{
              padding: '6px 18px',
              background: '#FFF3F0',
              borderBottom: '1px solid #ebebf0',
              fontSize: 11,
              color: '#FF3B30',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#FF3B30',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'inherit',
                padding: '0 4px'
              }}
            >
              &times;
            </button>
          </div>
        )}

        {/* List */}
        <div
          style={{ flex: 1, overflowY: 'auto', minHeight: filtered.length === 0 ? 72 : 'auto' }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '24px 18px',
                fontSize: 12,
                color: '#bbb',
                textAlign: 'center'
              }}
            >
              {activeTab === 'pending' ? i.emptyPending : i.emptyAll}
            </div>
          ) : (
            filtered.map((p, idx) => {
              const colors = statusColors[p.status] || statusColors.idle
              const statusLabel = i[statusLabelKey[p.status] || 'statusIdle']
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '13px 18px',
                    borderBottom:
                      idx < filtered.length - 1 ? '1px solid #f0f0f5' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12
                  }}
                >
                  <div
                    className={colors.pulse ? 'status-dot-pulse' : undefined}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: colors.dotColor,
                      flexShrink: 0
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 3
                      }}
                    >
                      {editing === p.id ? (
                        <input
                          ref={editRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={async () => {
                            if (editValue.trim() && editValue.trim() !== p.name) {
                              await window.api.rename(p.id, editValue.trim())
                            }
                            setEditing(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              ;(e.target as HTMLInputElement).blur()
                            } else if (e.key === 'Escape') {
                              setEditing(null)
                            }
                          }}
                          style={{
                            color: '#1d1d1f',
                            fontWeight: 600,
                            fontSize: 13,
                            border: '1px solid #1d1d1f',
                            borderRadius: 4,
                            padding: '1px 4px',
                            fontFamily: 'inherit',
                            width: 120
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditing(p.id)
                            setEditValue(p.name)
                            setTimeout(() => editRef.current?.select(), 0)
                          }}
                          style={{
                            color: '#1d1d1f',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'text',
                            borderBottom: '1px dashed transparent'
                          }}
                          onMouseEnter={(e) => {
                            ;(e.target as HTMLElement).style.borderBottomColor = '#c7c7cc'
                          }}
                          onMouseLeave={(e) => {
                            ;(e.target as HTMLElement).style.borderBottomColor = 'transparent'
                          }}
                        >
                          {p.name}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: colors.color }}>{statusLabel}</span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#3a3a3c',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: 3
                      }}
                    >
                      {p.message}
                    </div>
                    <div style={{ fontSize: 10, color: '#6e6e73' }}>
                      {formatElapsed(p.lastTimestamp)}
                    </div>
                  </div>
                  {p.status === 'approval' && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 4,
                        flexShrink: 0,
                        position: 'relative'
                      }}
                    >
                      <button
                        onClick={() => approve(p.id)}
                        disabled={loading === p.id}
                        style={{
                          background: loading === p.id ? '#6e6e73' : '#1d1d1f',
                          border: 'none',
                          borderRadius: 6,
                          padding: '5px 10px',
                          fontSize: 11,
                          color: '#fff',
                          fontWeight: 700,
                          cursor: loading === p.id ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          opacity: loading === p.id ? 0.7 : 1
                        }}
                      >
                        {loading === p.id ? i.sending : i.approve}
                      </button>
                      <button
                        onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)}
                        style={{
                          background: 'rgba(0,0,0,0.06)',
                          border: 'none',
                          borderRadius: 6,
                          padding: '5px 7px',
                          fontSize: 13,
                          color: '#6e6e73',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          lineHeight: 1
                        }}
                      >
                        &middot;&middot;&middot;
                      </button>
                      {openMenu === p.id && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            right: 0,
                            background: '#fff',
                            border: '1px solid #e0e0e8',
                            borderRadius: 8,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                            zIndex: 10,
                            overflow: 'hidden',
                            minWidth: 130
                          }}
                        >
                          <button
                            onClick={() => reject(p.id)}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '9px 14px',
                              background: 'none',
                              border: 'none',
                              textAlign: 'left',
                              fontSize: 12,
                              color: '#FF3B30',
                              cursor: 'pointer',
                              fontFamily: 'inherit'
                            }}
                          >
                            {i.reject}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default App
