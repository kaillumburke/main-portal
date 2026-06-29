'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, addDoc, getDocs, orderBy, query, serverTimestamp, collectionGroup } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { EmailBuilderModal, EmailConfig, emptyEmailConfig, generateEmailHTML } from '@/lib/email-builder'

type Pool = 'tickets' | 'guestlist' | 'customers'

const POOLS: { id: Pool; label: string; desc: string; icon: string }[] = [
  { id: 'tickets', label: 'Ticket buyers', desc: 'Everyone who bought a ticket', icon: '🎟' },
  { id: 'guestlist', label: 'Guestlist', desc: 'Guestlist sign-ups across all events', icon: '✦' },
  { id: 'customers', label: 'Customers', desc: 'All registered users', icon: '👤' },
]

const FONT = "'Mona Sans', system-ui, sans-serif"

interface Campaign {
  id: string
  name: string
  subject: string
  recipients: number
  sent: number
  status: 'sent' | 'failed' | 'draft'
  createdAt: { seconds: number }
}

function fmt(d: { seconds: number }) {
  return new Date(d.seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const S = { bg: '#f5f5f7', border: '#e5e5ea', card: '#fff', text: '#111', muted: '#6e6e73', label: '#aeaeb2' }

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'compose'>('list')

  // Compose state
  const [campName, setCampName] = useState('')
  const [fromName, setFromName] = useState('Connect')
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({ ...emptyEmailConfig })
  const [builderOpen, setBuilderOpen] = useState(false)
  const [recipientText, setRecipientText] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedPools, setSelectedPools] = useState<Pool[]>([])
  const [loadingPool, setLoadingPool] = useState<Pool | null>(null)

  const uploadImg = useCallback((file: File, path: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const storageRef = ref(storage, path)
      const task = uploadBytesResumable(storageRef, file)
      task.on('state_changed', () => {}, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)))
    }), [])

  useEffect(() => {
    getDocs(query(collection(db, 'campaigns'), orderBy('createdAt', 'desc')))
      .then(snap => setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Campaign))))
      .finally(() => setLoading(false))
  }, [])

  const parseRecipients = (text: string): string[] => {
    return text
      .split(/[\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  }

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const emails = parseRecipients(text)
      setRecipientText(prev => [...new Set([...parseRecipients(prev), ...emails])].join('\n'))
    }
    reader.readAsText(file)
  }

  const togglePool = async (pool: Pool) => {
    if (selectedPools.includes(pool)) {
      setSelectedPools(prev => prev.filter(p => p !== pool))
      return
    }
    setLoadingPool(pool)
    try {
      let emails: string[] = []
      if (pool === 'tickets') {
        const snap = await getDocs(collection(db, 'tickets'))
        emails = snap.docs.map(d => d.data().userEmail).filter(Boolean)
      } else if (pool === 'guestlist') {
        const snap = await getDocs(collectionGroup(db, 'guestList'))
        emails = snap.docs.map(d => d.data().email).filter(Boolean)
      } else if (pool === 'customers') {
        const snap = await getDocs(collection(db, 'users'))
        emails = snap.docs.map(d => d.data().email).filter(Boolean)
      }
      const unique = [...new Set(emails.map((e: string) => e.trim().toLowerCase()))]
      setRecipientText(prev => {
        const existing = parseRecipients(prev)
        return [...new Set([...existing, ...unique])].join('\n')
      })
      setSelectedPools(prev => [...prev, pool])
    } finally {
      setLoadingPool(null)
    }
  }

  const recipients = parseRecipients(recipientText)
  const hasEmailContent = emailConfig.blocks.length > 0

  const send = async () => {
    if (!campName || !emailConfig.subject || !hasEmailContent || recipients.length === 0) {
      setError('Please fill in all fields, build your email, and add at least one valid recipient.')
      return
    }
    setSending(true); setError(''); setResult(null)
    try {
      const html = generateEmailHTML(emailConfig)
      const res = await fetch('/api/send-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailConfig.subject, html, recipients, fromName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      const docRef = await addDoc(collection(db, 'campaigns'), {
        name: campName, subject: emailConfig.subject, fromName,
        emailConfig,
        recipients: recipients.length,
        sent: data.sent,
        status: 'sent',
        createdAt: serverTimestamp(),
      })
      setCampaigns(prev => [{ id: docRef.id, name: campName, subject: emailConfig.subject, recipients: recipients.length, sent: data.sent, status: 'sent', createdAt: { seconds: Date.now() / 1000 } }, ...prev])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const resetCompose = () => {
    setCampName(''); setFromName('Connect'); setEmailConfig({ ...emptyEmailConfig })
    setRecipientText(''); setResult(null); setError('')
    setSelectedPools([])
    setView('list')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 14px',
    border: `1.5px solid ${S.border}`, borderRadius: 8, fontSize: 14,
    fontFamily: FONT, color: S.text, background: '#fff', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: S.label,
    marginBottom: 6, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: '0.06em',
  }

  return (
    <div style={{ padding: 28, fontFamily: FONT }}>

      {/* Email builder modal */}
      {builderOpen && (
        <EmailBuilderModal
          label="Campaign email"
          config={emailConfig}
          onChange={setEmailConfig}
          uploadImg={uploadImg}
          onClose={() => setBuilderOpen(false)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: S.text, margin: 0 }}>
            {view === 'compose' ? (result ? '✅ Campaign sent' : 'New campaign') : 'Campaigns'}
          </h1>
          <p style={{ fontSize: 13, color: S.muted, margin: '4px 0 0' }}>
            {view === 'list' ? `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''} sent` : 'Send an email to a custom list'}
          </p>
        </div>
        {view === 'list' ? (
          <button onClick={() => setView('compose')} style={{ padding: '10px 20px', background: '#111', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
            + New campaign
          </button>
        ) : (
          <button onClick={resetCompose} style={{ padding: '10px 20px', background: 'transparent', color: S.muted, border: `1.5px solid ${S.border}`, borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
            ← Back
          </button>
        )}
      </div>

      {/* ── List view ── */}
      {view === 'list' && (
        <div style={{ background: S.card, borderRadius: 14, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: S.label, fontSize: 13 }}>Loading…</div>
          ) : campaigns.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📧</div>
              <p style={{ fontSize: 14, color: S.muted }}>No campaigns yet. Send your first one.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {['Campaign', 'Subject', 'Recipients', 'Sent', 'Status', 'Date'].map(col => (
                    <th key={col} style={{ padding: '11px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: S.label, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: `1px solid ${S.border}` }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} style={{ borderBottom: `1px solid #f5f5f5` }}>
                    <td style={{ padding: '14px 20px', fontSize: 13.5, fontWeight: 600, color: S.text }}>{c.name}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: S.muted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: S.text }}>{c.recipients}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: S.text }}>{c.sent}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: c.status === 'sent' ? '#22c55e' : '#ef4444', background: c.status === 'sent' ? '#f0fdf4' : '#fef2f2', padding: '3px 10px', borderRadius: 20 }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 12.5, color: S.muted }}>{fmt(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Compose view ── */}
      {view === 'compose' && !result && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

          {/* Left: form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ background: S.card, borderRadius: 14, border: `1px solid ${S.border}`, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0 }}>Campaign details</h2>
              <div>
                <label style={labelStyle}>Campaign name</label>
                <input value={campName} onChange={e => setCampName(e.target.value)} placeholder="e.g. Easter Weekend Promo" style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#111' }} onBlur={e => { e.target.style.borderColor = S.border }} />
              </div>
              <div>
                <label style={labelStyle}>From name</label>
                <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Connect" style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#111' }} onBlur={e => { e.target.style.borderColor = S.border }} />
                <p style={{ fontSize: 11, color: S.label, margin: '5px 0 0' }}>Sends from hello@connectclub.live</p>
              </div>
            </div>

            {/* Email builder card */}
            <div style={{ background: S.card, borderRadius: 14, border: `1px solid ${S.border}`, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0 }}>Email content</h2>
                <button onClick={() => setBuilderOpen(true)}
                  style={{ padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
                  {hasEmailContent ? 'Edit email' : 'Open builder'}
                </button>
              </div>

              {/* Subject line preview */}
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Subject line</label>
                <input value={emailConfig.subject} onChange={e => setEmailConfig(c => ({ ...c, subject: e.target.value }))}
                  placeholder="Set in the builder or type here…" style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#111' }} onBlur={e => { e.target.style.borderColor = S.border }} />
              </div>

              {hasEmailContent ? (
                <div style={{ border: `1px solid ${S.border}`, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                  <iframe
                    srcDoc={generateEmailHTML(emailConfig, 'Alex')}
                    style={{ width: '100%', height: 300, border: 'none', pointerEvents: 'none', display: 'block' }}
                    title="Email preview"
                  />
                  <div style={{ position: 'absolute', inset: 0, cursor: 'pointer' }} onClick={() => setBuilderOpen(true)} title="Click to edit" />
                  <div style={{ padding: '8px 12px', background: '#f5f5f7', borderTop: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: S.muted }}>{emailConfig.blocks.length} block{emailConfig.blocks.length !== 1 ? 's' : ''}</span>
                    <button onClick={() => setBuilderOpen(true)} style={{ fontSize: 11, color: '#111', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>Edit →</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => setBuilderOpen(true)} style={{ border: `2px dashed ${S.border}`, borderRadius: 10, padding: 40, textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#111' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = S.border }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✉</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 4 }}>Design your email</div>
                  <div style={{ fontSize: 12, color: S.muted }}>Click "Open builder" to create your campaign email with the drag-and-drop editor</div>
                </div>
              )}
            </div>
          </div>

          {/* Right: recipients + send */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: S.card, borderRadius: 14, border: `1px solid ${S.border}`, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0 }}>Recipients</h2>
                <button onClick={() => fileRef.current?.click()} style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
                  Import CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display: 'none' }} />
              </div>

              {/* Data pool selector */}
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: S.label, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Add from data pool</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {POOLS.map(pool => {
                    const selected = selectedPools.includes(pool.id)
                    const isLoading = loadingPool === pool.id
                    return (
                      <button key={pool.id} onClick={() => togglePool(pool.id)} disabled={isLoading}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                          background: selected ? '#f0fdf4' : '#fafafa',
                          border: `1.5px solid ${selected ? '#86efac' : S.border}`,
                          borderRadius: 9, cursor: isLoading ? 'wait' : 'pointer',
                          fontFamily: FONT, textAlign: 'left', width: '100%',
                          transition: 'all 0.15s',
                        }}>
                        <span style={{ fontSize: 15 }}>{pool.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: selected ? '#16a34a' : S.text }}>{pool.label}</div>
                          <div style={{ fontSize: 11, color: S.label }}>{pool.desc}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: selected ? '#16a34a' : S.label }}>
                          {isLoading ? 'Loading…' : selected ? '✓ Added' : '+'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <textarea
                value={recipientText}
                onChange={e => setRecipientText(e.target.value)}
                placeholder={"Paste email addresses here,\none per line or comma separated.\n\ne.g.\njohn@example.com\njane@example.com"}
                rows={10}
                style={{ ...inputStyle, resize: 'vertical', fontSize: 12.5, lineHeight: 1.7 }}
                onFocus={e => { e.target.style.borderColor = '#111' }} onBlur={e => { e.target.style.borderColor = S.border }} />
              <div style={{ marginTop: 10, padding: '8px 12px', background: recipients.length > 0 ? '#f0fdf4' : '#f5f5f7', borderRadius: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: recipients.length > 0 ? '#16a34a' : S.label }}>
                  {recipients.length > 0 ? `✓ ${recipients.length} valid email${recipients.length !== 1 ? 's' : ''}` : 'No valid emails yet'}
                </span>
              </div>
            </div>

            {error && (
              <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#dc2626' }}>
                {error}
              </div>
            )}

            <button onClick={send} disabled={sending}
              style={{ padding: '14px', background: sending ? '#888' : '#111', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: sending ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
              {sending ? `Sending to ${recipients.length} recipients…` : `Send campaign →`}
            </button>
            <p style={{ fontSize: 11.5, color: S.label, textAlign: 'center', margin: 0 }}>
              This will send immediately. Double-check before sending.
            </p>
          </div>
        </div>
      )}

      {/* ── Success view ── */}
      {result && (
        <div style={{ background: S.card, borderRadius: 16, border: `1px solid ${S.border}`, padding: 48, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: S.text, margin: '0 0 10px' }}>Campaign sent!</h2>
          <p style={{ fontSize: 14, color: S.muted, margin: '0 0 28px' }}>
            Successfully delivered to <strong style={{ color: S.text }}>{result.sent}</strong> of <strong style={{ color: S.text }}>{result.total}</strong> recipients.
          </p>
          <button onClick={resetCompose} style={{ padding: '12px 28px', background: '#111', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
            Back to campaigns
          </button>
        </div>
      )}
    </div>
  )
}
