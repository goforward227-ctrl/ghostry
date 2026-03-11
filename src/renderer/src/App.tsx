import { useState, useEffect, useCallback } from 'react'
import type { ClaudeProcessDTO } from '../../preload/index.d'
import './App.css'

type TabType = 'すべて' | '承認待ち'

const statusConfig = {
  approval: { label: '承認待ち', color: '#FF9500', dotColor: '#FF9500', pulse: false },
  running: { label: '実行中', color: '#007AFF', dotColor: '#007AFF', pulse: true },
  done: { label: '完了', color: '#aeaeb2', dotColor: '#c7c7cc', pulse: false }
}

function formatElapsed(timestampMs: number): string {
  const diffSec = Math.floor((Date.now() - timestampMs) / 1000)
  if (diffSec < 10) return 'たった今'
  if (diffSec < 60) return `${diffSec}秒前`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`
  return `${Math.floor(diffSec / 3600)}時間前`
}

function App(): React.ReactNode {
  const [processes, setProcesses] = useState<ClaudeProcessDTO[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('すべて')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // Update elapsed times every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000)
    return (): void => clearInterval(interval)
  }, [])

  // Listen for process updates from main process
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
        setError(result.error || '承認に失敗しました')
      }
    } catch {
      setError('通信エラー')
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
      setError('通信エラー')
    } finally {
      setLoading(null)
      setOpenMenu(null)
    }
  }, [])

  const bulkApprove = useCallback(async () => {
    await window.api.bulkApprove()
  }, [])

  const tabs: TabType[] = ['すべて', '承認待ち']
  const approvalCount = processes.filter((p) => p.status === 'approval').length

  const filtered = processes.filter((p) => {
    if (activeTab === '承認待ち') return p.status === 'approval'
    return true
  })

  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
        background: 'transparent',
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
            <span style={{ color: '#1d1d1f', fontWeight: 700, fontSize: 15 }}>すべての通知</span>
            <span style={{ fontSize: 11, color: '#aeaeb2', fontWeight: 700 }}>
              {processes.length}プロセス
            </span>
          </div>
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
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '10px 12px',
                  fontSize: 12,
                  color: activeTab === tab ? '#1d1d1f' : '#6e6e73',
                  borderBottom:
                    activeTab === tab ? '2px solid #007AFF' : '2px solid transparent',
                  fontFamily: 'inherit',
                  transition: 'color 0.15s'
                }}
              >
                {tab}
                {tab === '承認待ち' && approvalCount > 0 && (
                  <span
                    style={{
                      marginLeft: 5,
                      background: '#FF9500',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '0 5px',
                      fontSize: 10,
                      fontWeight: 700
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
                background: '#007AFF',
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
              一括承認
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
        <div style={{ flex: 1, overflowY: 'auto', minHeight: filtered.length === 0 ? 72 : 'auto' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '24px 18px',
                fontSize: 12,
                color: '#bbb',
                textAlign: 'center'
              }}
            >
              {activeTab === '承認待ち' ? '承認待ちはありません' : 'プロセスなし'}
            </div>
          ) : (
            filtered.map((p, i) => {
              const cfg = statusConfig[p.status]
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '13px 18px',
                    borderBottom: i < filtered.length - 1 ? '1px solid #f0f0f5' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12
                  }}
                >
                  <div
                    className={cfg.pulse ? 'status-dot-pulse' : undefined}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: cfg.dotColor,
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
                      <span style={{ color: '#1d1d1f', fontWeight: 600, fontSize: 13 }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: 10, color: cfg.color }}>{cfg.label}</span>
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
                          background: loading === p.id ? '#99c9ff' : '#007AFF',
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
                        {loading === p.id ? '送信中...' : '承認'}
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
                            却下
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
