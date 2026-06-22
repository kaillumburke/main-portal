'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, orderBy, query, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const audiences = [
  { value: 'everyone', label: 'Everyone', desc: 'All subscribers' },
  { value: 'ticketHolders', label: 'Ticket Holders', desc: 'Anyone who bought a ticket' },
  { value: 'vipOnly', label: 'VIP Only', desc: 'VIP tier ticket holders' },
]

interface SentNotification {
  id: string
  title: string
  body: string
  imageUrl?: string
  audience: string
  recipients: number
  sentAt: { seconds: number }
  linkType?: 'none' | 'event' | 'signup'
  selectedEventId?: string
  selectedSignUpSlug?: string
}

interface EventOption { id: string; name: string; date: { seconds: number } }
interface SignUpOption { id: string; slug: string; title: string }

export default function NotificationsPage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [audience, setAudience] = useState('everyone')
  const [linkType, setLinkType] = useState<'none' | 'event' | 'signup'>('none')
  const [events, setEvents] = useState<EventOption[]>([])
  const [signUps, setSignUps] = useState<SignUpOption[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedSignUpSlug, setSelectedSignUpSlug] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [history, setHistory] = useState<SentNotification[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const loadHistory = () => {
    getDocs(query(collection(db, 'sent_notifications'), orderBy('sentAt', 'desc')))
      .then(snap => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as SentNotification))))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }

  useEffect(() => { loadHistory(); loadLinkOptions() }, [])

  const loadLinkOptions = async () => {
    const [evSnap, suSnap] = await Promise.all([
      getDocs(query(collection(db, 'events'))),
      getDocs(query(collection(db, 'signUpLinks'))),
    ])
    setEvents(evSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as EventOption))
      .filter(e => (e as any).status === 'published')
      .sort((a, b) => a.date.seconds - b.date.seconds)
    )
    setSignUps(suSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as SignUpOption))
      .filter(s => (s as any).active)
    )
  }

  const send = async () => {
    if (!title.trim() || !body.trim()) return
    setSending(true)
    setResult(null)

    const data: Record<string, unknown> = {}
    if (linkType === 'event' && selectedEventId) {
      data.type = 'event'
      data.id = selectedEventId
    } else if (linkType === 'signup' && selectedSignUpSlug) {
      data.type = 'signup'
      data.slug = selectedSignUpSlug
    }

    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          audience,
          ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
          ...(Object.keys(data).length ? { data } : {}),
        }),
      })
      const json = await res.json()
      if (res.ok) {
        const { successful, total, errors } = json
        setResult({
          success: successful > 0 || total === 0,
          message: total === 0
            ? 'No registered devices yet — open the app on each phone first'
            : successful > 0
              ? `Delivered to ${successful} of ${total} device${total !== 1 ? 's' : ''}${errors?.length ? ` (${errors.join(', ')})` : ''}`
              : `Failed — ${errors?.join(', ') ?? 'unknown error'}`,
        })

        await addDoc(collection(db, 'sent_notifications'), {
          title: title.trim(),
          body: body.trim(),
          ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
          audience,
          recipients: successful,
          sentAt: Timestamp.now(),
          ...(linkType !== 'none' ? { linkType } : {}),
          ...(linkType === 'event' && selectedEventId ? { selectedEventId } : {}),
          ...(linkType === 'signup' && selectedSignUpSlug ? { selectedSignUpSlug } : {}),
        })

        setTitle('')
        setBody('')
        setImageUrl('')
        setLinkType('none')
        setSelectedEventId('')
        setSelectedSignUpSlug('')
        loadHistory()
      } else {
        setResult({ success: false, message: json.error ?? `HTTP ${res.status}` })
      }
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setSending(false)
    }
  }

  const replicate = (n: SentNotification) => {
    setTitle(n.title)
    setBody(n.body)
    setImageUrl(n.imageUrl ?? '')
    setAudience(n.audience)
    setLinkType(n.linkType ?? 'none')
    setSelectedEventId(n.selectedEventId ?? '')
    setSelectedSignUpSlug(n.selectedSignUpSlug ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const audienceLabel = (a: string) => {
    if (a === 'ticketHolders') return 'Ticket Holders'
    if (a === 'vipOnly') return 'VIP Only'
    return 'Everyone'
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>
      <div className="px-8 py-5" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <h1 className="text-base font-bold text-gray-900">Push Notifications</h1>
        <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>Send directly to app subscribers via APNs</p>
      </div>

      <div className="p-8 grid grid-cols-2 gap-8 items-start">
        {/* Compose form */}
        <div className="rounded-xl p-6 flex flex-col gap-5" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
          <div className="text-xs font-semibold text-gray-900">Compose</div>

          {/* Audience */}
          <div>
            <label className="text-[10px] uppercase tracking-widest mb-2 block" style={{ color: '#6e6e73' }}>Audience</label>
            <div className="flex flex-col gap-2">
              {audiences.map(a => (
                <label key={a.value}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all"
                  style={{
                    background: audience === a.value ? '#1a1400' : '#1a1a1a',
                    border: `1px solid ${audience === a.value ? '#C9A84C' : '#2a2a2a'}`,
                  }}>
                  <input type="radio" name="audience" value={a.value}
                    checked={audience === a.value} onChange={() => setAudience(a.value)}
                    className="accent-yellow-500" />
                  <div>
                    <div className="text-xs font-medium text-gray-900">{a.label}</div>
                    <div className="text-[10px]" style={{ color: '#6e6e73' }}>{a.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Title</label>
            <input type="text" placeholder="e.g. Doors open tonight 🎉"
              value={title} onChange={e => setTitle(e.target.value)} maxLength={64}
              className="w-full rounded-lg px-3 py-2.5 text-xs text-gray-900 outline-none"
              style={{ background: '#f0f0f2', border: '1px solid #e5e5ea' }} />
            <div className="text-right text-[10px] mt-1" style={{ color: '#6e6e73' }}>{title.length}/64</div>
          </div>

          {/* Body */}
          <div>
            <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Message</label>
            <textarea placeholder="e.g. We're open from 10pm — see you on the dancefloor"
              value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={180}
              className="w-full rounded-lg px-3 py-2.5 text-xs text-gray-900 outline-none resize-none"
              style={{ background: '#f0f0f2', border: '1px solid #e5e5ea' }} />
            <div className="text-right text-[10px] mt-1" style={{ color: '#6e6e73' }}>{body.length}/180</div>
          </div>

          {/* Image URL */}
          <div>
            <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Image URL <span style={{ color: '#aaa', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <input type="url" placeholder="https://example.com/image.jpg"
              value={imageUrl} onChange={e => setImageUrl(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-xs text-gray-900 outline-none"
              style={{ background: '#f0f0f2', border: '1px solid #e5e5ea' }} />
            <div className="text-[10px] mt-1" style={{ color: '#aaa' }}>Shown as a banner image on iOS &amp; Android</div>
          </div>

          {/* Deep Link */}
          <div>
            <label className="text-[10px] uppercase tracking-widest mb-2 block" style={{ color: '#6e6e73' }}>Deep Link <span style={{ color: '#aaa', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <div className="flex gap-2 mb-2">
              {(['none', 'event', 'signup'] as const).map(type => (
                <button key={type} onClick={() => setLinkType(type)}
                  className="flex-1 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all"
                  style={{
                    background: linkType === type ? '#f5edda' : '#f0f0f2',
                    border: `1px solid ${linkType === type ? '#C9A84C' : '#e5e5ea'}`,
                    color: linkType === type ? '#C9A84C' : '#6e6e73',
                  }}>
                  {type === 'none' ? 'None' : type === 'event' ? 'Event' : 'Sign Up'}
                </button>
              ))}
            </div>
            {linkType === 'event' && (
              <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-xs text-gray-900 outline-none"
                style={{ background: '#f0f0f2', border: '1px solid #e5e5ea' }}>
                <option value="">Select an event…</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            )}
            {linkType === 'signup' && (
              <select value={selectedSignUpSlug} onChange={e => setSelectedSignUpSlug(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-xs text-gray-900 outline-none"
                style={{ background: '#f0f0f2', border: '1px solid #e5e5ea' }}>
                <option value="">Select a sign-up link…</option>
                {signUps.map(s => (
                  <option key={s.id} value={s.slug}>{s.title}</option>
                ))}
              </select>
            )}
          </div>

          {/* Preview */}
          {(title || body) && (
            <div className="rounded-xl p-4" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }}>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>Preview</div>
              <div className="flex items-start gap-3">
                <img src="/app-icon.png" alt="Mansion" className="w-8 h-8 rounded-lg flex-shrink-0 object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-900">{title || 'Notification title'}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#6e6e73' }}>{body || 'Message body'}</div>
                  {imageUrl.trim() && (
                    <img src={imageUrl} alt="" className="mt-2 rounded-lg w-full object-cover" style={{ maxHeight: 120 }} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-lg px-4 py-3 text-xs"
              style={{ background: result.success ? '#0a2010' : '#2e0f0f', color: result.success ? '#4ade80' : '#f87171' }}>
              {result.success ? '✓ ' : '✕ '}{result.message}
            </div>
          )}

          <button onClick={send} disabled={sending || !title.trim() || !body.trim()}
            className="w-full py-3 rounded-lg text-xs font-semibold tracking-wide disabled:opacity-40"
            style={{ background: '#111111', color: '#fff' }}>
            {sending ? 'Sending…' : 'Send Notification'}
          </button>
        </div>

        {/* History */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
          <div className="px-5 py-3" style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
            <span className="text-xs font-semibold text-gray-900">Sent History</span>
          </div>
          {historyLoading ? (
            <div className="px-5 py-12 text-xs text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>Loading…</div>
          ) : history.length === 0 ? (
            <div className="px-5 py-12 text-xs text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>No notifications sent yet</div>
          ) : (
            <div style={{ background: '#f5f5f7' }}>
              {history.map((n, i) => (
                <div key={n.id} className="px-5 py-4 flex items-start gap-3"
                  style={{ borderBottom: i < history.length - 1 ? '1px solid #141414' : 'none' }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: '#fef9ee' }}>
                    <span className="text-[10px] font-black" style={{ color: '#111111' }}>M</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-gray-900 truncate">{n.title}</div>
                      <div className="text-[10px] flex-shrink-0" style={{ color: '#6e6e73' }}>
                        {n.sentAt ? new Date(n.sentAt.seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                    </div>
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: '#6e6e73' }}>{n.body}</div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider" style={{ background: '#f0f0f2', color: '#6e6e73' }}>
                        {audienceLabel(n.audience)}
                      </span>
                      <span className="text-[10px]" style={{ color: '#6e6e73' }}>
                        {n.recipients} device{n.recipients !== 1 ? 's' : ''}
                      </span>
                      <button onClick={() => replicate(n)}
                        className="ml-auto text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all"
                        style={{ background: '#f0f0f2', color: '#C9A84C', border: '1px solid #e5e5ea' }}>
                        Resend
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
