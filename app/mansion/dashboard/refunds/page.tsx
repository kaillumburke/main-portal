'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, updateDoc, doc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface RefundRequest {
  id: string
  name: string
  email: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED'
  createdAt: { seconds: number }
  resolvedAt?: { seconds: number }
}

function fmtDate(ts: { seconds: number }) {
  return new Date(ts.seconds * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const statusStyle = (s: string) => {
  if (s === 'APPROVED') return { bg: '#dcfce7', color: '#16a34a' }
  if (s === 'DECLINED') return { bg: '#fee2e2', color: '#dc2626' }
  return { bg: '#fef9c3', color: '#a16207' }
}

export default function RefundsPage() {
  const [requests, setRequests] = useState<RefundRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'DECLINED'>('ALL')

  useEffect(() => {
    const q = query(collection(db, 'refundRequests'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as RefundRequest)))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const updateStatus = async (id: string, status: 'APPROVED' | 'DECLINED') => {
    setUpdating(id)
    await updateDoc(doc(db, 'refundRequests', id), {
      status,
      resolvedAt: Timestamp.now(),
    })
    setUpdating(null)
  }

  const filtered = filter === 'ALL' ? requests : requests.filter(r => r.status === filter)
  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  return (
    <div style={{ padding: '32px 32px 80px', background: '#f5f5f7', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111111' }}>Refund Requests</h1>
          {pendingCount > 0 && (
            <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 999 }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        <p style={{ fontSize: 14, color: '#6e6e73' }}>Review and action refund requests submitted through the app.</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['ALL', 'PENDING', 'APPROVED', 'DECLINED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: filter === f ? '#111111' : '#ffffff',
              color: filter === f ? '#ffffff' : '#6e6e73',
              border: `1px solid ${filter === f ? '#111111' : '#e5e5ea'}`,
            }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#6e6e73', fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 12, padding: 40, textAlign: 'center', color: '#6e6e73', fontSize: 14 }}>
          No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}refund requests.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(req => {
            const ss = statusStyle(req.status)
            return (
              <div key={req.id} style={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111111', marginBottom: 2 }}>{req.name}</div>
                    <div style={{ fontSize: 13, color: '#6e6e73' }}>{req.email}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <span style={{ background: ss.bg, color: ss.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {req.status}
                    </span>
                    <span style={{ fontSize: 12, color: '#aeaeb2' }}>{fmtDate(req.createdAt)}</span>
                  </div>
                </div>

                <div style={{ background: '#f5f5f7', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Reason</div>
                  <div style={{ fontSize: 14, color: '#111111', lineHeight: 1.6 }}>{req.reason}</div>
                </div>

                {req.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      disabled={updating === req.id}
                      onClick={() => updateStatus(req.id, 'APPROVED')}
                      style={{
                        padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0',
                        opacity: updating === req.id ? 0.5 : 1,
                      }}>
                      ✓ Approve
                    </button>
                    <button
                      disabled={updating === req.id}
                      onClick={() => updateStatus(req.id, 'DECLINED')}
                      style={{
                        padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca',
                        opacity: updating === req.id ? 0.5 : 1,
                      }}>
                      ✕ Decline
                    </button>
                  </div>
                )}

                {req.resolvedAt && (
                  <div style={{ fontSize: 12, color: '#aeaeb2', marginTop: req.status === 'PENDING' ? 0 : 0 }}>
                    Resolved {fmtDate(req.resolvedAt)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
