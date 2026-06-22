'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { FirestoreTicket, AppEvent } from '@/lib/types'
import { getAllAppConfigs, AppConfig } from '@/lib/platform-config'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'

function fmt(pence: number) {
  return '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

interface EventSummary {
  eventId: string
  eventName: string
  eventDate: number
  source: string
  tickets: number
  gross: number
  fees: number
  payout: number
  isPaid: boolean
}

interface Withdrawal {
  id: string
  date: string
  amount: number
  note: string
}

const GOLD = '#C9A84C'
const BG = '#f5f5f7'
const CARD = '#ffffff'
const BORDER = '#e5e5ea'
const BLUE = '#111111'

export default function AnalyticsPage() {
  const [events, setEvents] = useState<EventSummary[]>([])
  const [appConfigs, setAppConfigs] = useState<Record<string, AppConfig>>({})
  const [paid, setPaid] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'payouts' | 'revenue' | 'withdraw'>('overview')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [withdrawNote, setWithdrawNote] = useState('')
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)

  useEffect(() => {
    const storedW = localStorage.getItem('sc_withdrawals')
    if (storedW) setWithdrawals(JSON.parse(storedW))

    const stored = localStorage.getItem('sc_paid_payouts')
    if (stored) setPaid(new Set(JSON.parse(stored)))

    Promise.all([
      getDocs(query(collection(db, 'tickets'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'events'), orderBy('date', 'desc'))),
      getAllAppConfigs(),
    ]).then(([ticketSnap, eventSnap, configs]) => {
      const tickets = ticketSnap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreTicket))
      const eventDates: Record<string, number> = {}
      eventSnap.docs.forEach(d => {
        const ev = { id: d.id, ...d.data() } as AppEvent
        eventDates[ev.id] = ev.date?.seconds ?? 0
      })

      // Build config map, default to 10% if not in Firestore yet
      const configMap: Record<string, AppConfig> = {}
      configs.forEach(c => { configMap[c.id] = c })
      if (!configMap['mansion']) {
        configMap['mansion'] = { id: 'mansion', name: 'Mansion Nightclub', feePercent: 10, active: true, createdAt: '', color: '#C9A84C' }
      }
      setAppConfigs(configMap)

      const mansionFee = (configMap['mansion']?.feePercent ?? 10) / 100

      const map = new Map<string, EventSummary>()
      tickets.forEach(t => {
        if (t.status === 'cancelled' || t.status === 'refunded') return
        const gross = t.tierPriceInPence
        // Use the app-specific fee rate (mansion tickets are all from the mansion app)
        const feeRate = mansionFee
        const fee = Math.round(gross * feeRate)
        const payout = gross - fee
        const existing = map.get(t.eventId)
        if (existing) {
          existing.tickets++
          existing.gross += gross
          existing.fees += fee
          existing.payout += payout
        } else {
          map.set(t.eventId, {
            eventId: t.eventId,
            eventName: t.eventName,
            eventDate: eventDates[t.eventId] ?? t.eventDate?.seconds ?? 0,
            source: 'Mansion Nightclub',
            tickets: 1,
            gross,
            fees: fee,
            payout,
            isPaid: false,
          })
        }
      })

      const result = Array.from(map.values()).sort((a, b) => b.eventDate - a.eventDate)
      setEvents(result)
      setLoading(false)
    })
  }, [])

  const totalWithdrawn = withdrawals.reduce((s, w) => s + w.amount, 0)

  const handleWithdraw = () => {
    const available = totalFees - totalWithdrawn
    if (available <= 0) return
    const w: Withdrawal = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      amount: available,
      note: withdrawNote.trim() || 'Booking fee withdrawal',
    }
    const next = [...withdrawals, w]
    setWithdrawals(next)
    localStorage.setItem('sc_withdrawals', JSON.stringify(next))
    setWithdrawNote('')
    setShowWithdrawModal(false)
  }

  const togglePaid = (eventId: string) => {
    setPaid(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      localStorage.setItem('sc_paid_payouts', JSON.stringify(Array.from(next)))
      return next
    })
  }

  const sources = ['all', ...Array.from(new Set(events.map(e => e.source)))]
  const filtered = sourceFilter === 'all' ? events : events.filter(e => e.source === sourceFilter)

  const totalGross = filtered.reduce((s, e) => s + e.gross, 0)
  const totalFees = filtered.reduce((s, e) => s + e.fees, 0)
  const totalPayout = filtered.reduce((s, e) => s + e.payout, 0)
  const totalPending = filtered.filter(e => !paid.has(e.eventId)).reduce((s, e) => s + e.payout, 0)
  const totalPaid = filtered.filter(e => paid.has(e.eventId)).reduce((s, e) => s + e.payout, 0)
  const totalTickets = filtered.reduce((s, e) => s + e.tickets, 0)

  // Revenue by month chart data
  const monthMap = new Map<string, { month: string; gross: number; fees: number; payouts: number }>()
  filtered.forEach(e => {
    if (!e.eventDate) return
    const d = new Date(e.eventDate * 1000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    const existing = monthMap.get(key)
    if (existing) {
      existing.gross += e.gross
      existing.fees += e.fees
      existing.payouts += e.payout
    } else {
      monthMap.set(key, { month: label, gross: e.gross, fees: e.fees, payouts: e.payout })
    }
  })
  const monthData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      month: v.month,
      'Gross (£)': parseFloat((v.gross / 100).toFixed(2)),
      'Fees (£)': parseFloat((v.fees / 100).toFixed(2)),
      'Payouts (£)': parseFloat((v.payouts / 100).toFixed(2)),
    }))

  // Revenue by event chart
  const eventChartData = filtered.slice(0, 8).map(e => ({
    name: e.eventName.length > 16 ? e.eventName.slice(0, 16) + '…' : e.eventName,
    'Gross (£)': parseFloat((e.gross / 100).toFixed(2)),
    'Fees (£)': parseFloat((e.fees / 100).toFixed(2)),
  })).reverse()

  const availableToWithdraw = totalFees - totalWithdrawn

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'payouts', label: 'Payouts' },
    { id: 'withdraw', label: 'Booking Fees' },
  ] as const

  return (
    <div className="flex-1 overflow-auto" style={{ background: BG }}>
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <h1 className="text-sm font-semibold" style={{ color: '#111111' }}>Analytics & Finance</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>All apps · all events</p>
        </div>
        <div className="flex items-center gap-2">
          {sources.map(s => (
            <button key={s} onClick={() => setSourceFilter(s)}
              className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all"
              style={{
                background: sourceFilter === s ? BLUE : CARD,
                color: sourceFilter === s ? '#fff' : '#666',
                border: `1px solid ${sourceFilter === s ? BLUE : BORDER}`,
              }}>
              {s === 'all' ? 'All Apps' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-1" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="px-5 py-3 text-[12px] font-medium transition-all"
            style={{
              color: activeTab === t.id ? '#fff' : '#555',
              borderBottom: activeTab === t.id ? `2px solid ${BLUE}` : '2px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-8 space-y-6">
        {/* Summary cards — always visible */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Gross Revenue', value: fmt(totalGross) },
            { label: 'Booking Fees Earned', value: fmt(totalFees), gold: true },
            { label: 'Pending Payouts', value: fmt(totalPending), warn: true },
            { label: 'Paid Out', value: fmt(totalPaid), green: true },
          ].map(c => (
            <div key={c.label} className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>{c.label}</div>
              <div className="text-2xl font-bold" style={{ color: c.gold ? GOLD : c.warn ? '#f97316' : c.green ? '#4ade80' : '#fff' }}>
                {loading ? '—' : c.value}
              </div>
            </div>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>Total Tickets Sold</div>
              <div className="text-2xl font-bold text-gray-900">{loading ? '—' : totalTickets.toLocaleString()}</div>
            </div>
            <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>Total Events</div>
              <div className="text-2xl font-bold text-gray-900">{loading ? '—' : filtered.length}</div>
            </div>
            <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>Avg Revenue / Event</div>
              <div className="text-2xl font-bold" style={{ color: GOLD }}>
                {loading || filtered.length === 0 ? '—' : fmt(Math.round(totalGross / filtered.length))}
              </div>
            </div>

            {/* Revenue by month chart */}
            <div className="col-span-3 rounded-xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: '#6e6e73' }}>Revenue by Month</div>
              {monthData.length === 0 ? (
                <div className="text-xs py-8 text-center" style={{ color: '#6e6e73' }}>No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                    <XAxis dataKey="month" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                    <Tooltip
                      contentStyle={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#6e6e73' }}
                      formatter={(v) => typeof v === 'number' ? `£${v.toFixed(2)}` : String(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#6e6e73' }} />
                    <Line type="monotone" dataKey="Gross (£)" stroke={GOLD} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Fees (£)" stroke="#4ade80" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Payouts (£)" stroke="#f97316" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* Revenue tab */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div className="rounded-xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: '#6e6e73' }}>Gross vs Fees by Event</div>
              {eventChartData.length === 0 ? (
                <div className="text-xs py-8 text-center" style={{ color: '#6e6e73' }}>No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={eventChartData} layout="vertical">
                    <XAxis type="number" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#888', fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
                    <Tooltip
                      contentStyle={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#6e6e73' }}
                      formatter={(v) => typeof v === 'number' ? `£${v.toFixed(2)}` : String(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#6e6e73' }} />
                    <Bar dataKey="Gross (£)" fill={GOLD} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Fees (£)" fill="#4ade80" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue breakdown table */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              <table className="w-full text-xs" style={{ background: BG }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['Event', 'App', 'Date', 'Tickets', 'Gross', 'Fee (10%)', 'Payout'].map(h => (
                      <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center" style={{ color: '#6e6e73' }}>Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center" style={{ color: '#6e6e73' }}>No data yet</td></tr>
                  ) : filtered.map(e => (
                    <tr key={e.eventId} style={{ borderBottom: '1px solid #141414' }}>
                      <td className="px-5 py-3 font-medium text-gray-900">{e.eventName}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{e.source}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>
                        {e.eventDate ? new Date(e.eventDate * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                      </td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{e.tickets}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{fmt(e.gross)}</td>
                      <td className="px-5 py-3 font-medium" style={{ color: '#16a34a' }}>{fmt(e.fees)}</td>
                      <td className="px-5 py-3 font-semibold" style={{ color: GOLD }}>{fmt(e.payout)}</td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td className="px-5 py-3 font-semibold text-gray-900" colSpan={3}>Total</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{totalTickets}</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{fmt(totalGross)}</td>
                      <td className="px-5 py-3 font-semibold" style={{ color: '#16a34a' }}>{fmt(totalFees)}</td>
                      <td className="px-5 py-3 font-semibold" style={{ color: GOLD }}>{fmt(totalPayout)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Payouts tab */}
        {activeTab === 'payouts' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>Outstanding Payouts</div>
                <div className="text-2xl font-bold" style={{ color: '#ea580c' }}>{loading ? '—' : fmt(totalPending)}</div>
                <div className="text-xs mt-1" style={{ color: '#6e6e73' }}>
                  {filtered.filter(e => !paid.has(e.eventId)).length} event{filtered.filter(e => !paid.has(e.eventId)).length !== 1 ? 's' : ''} pending
                </div>
              </div>
              <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>Total Paid Out</div>
                <div className="text-2xl font-bold" style={{ color: '#16a34a' }}>{loading ? '—' : fmt(totalPaid)}</div>
                <div className="text-xs mt-1" style={{ color: '#6e6e73' }}>
                  {filtered.filter(e => paid.has(e.eventId)).length} event{filtered.filter(e => paid.has(e.eventId)).length !== 1 ? 's' : ''} settled
                </div>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              {loading ? (
                <div className="px-6 py-12 text-xs text-center" style={{ color: '#6e6e73', background: BG }}>Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="px-6 py-12 text-xs text-center" style={{ color: '#6e6e73', background: BG }}>No payout data yet</div>
              ) : (
                <table className="w-full text-xs" style={{ background: BG }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                      {['Event', 'App', 'Date', 'Tickets', 'Gross', 'Fee Earned', 'Payout Due', 'Status', ''].map(h => (
                        <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(e => {
                      const isPaid = paid.has(e.eventId)
                      return (
                        <tr key={e.eventId} style={{ borderBottom: '1px solid #141414' }}>
                          <td className="px-5 py-3 font-medium text-gray-900">{e.eventName}</td>
                          <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{e.source}</td>
                          <td className="px-5 py-3" style={{ color: '#6e6e73' }}>
                            {e.eventDate ? new Date(e.eventDate * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                          </td>
                          <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{e.tickets}</td>
                          <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{fmt(e.gross)}</td>
                          <td className="px-5 py-3 font-medium" style={{ color: '#16a34a' }}>{fmt(e.fees)}</td>
                          <td className="px-5 py-3 font-semibold" style={{ color: isPaid ? '#555' : GOLD }}>{fmt(e.payout)}</td>
                          <td className="px-5 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                              style={{ background: isPaid ? '#dcfce7' : '#fff7ed', color: isPaid ? '#4ade80' : '#f97316' }}>
                              {isPaid ? 'Paid' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <button onClick={() => togglePaid(e.eventId)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                              style={{ background: '#f5f5f7', color: '#6e6e73', border: '1px solid #e5e5ea' }}>
                              {isPaid ? 'Mark unpaid' : 'Mark paid'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
        {/* Booking Fees / Withdraw tab */}
        {activeTab === 'withdraw' && (
          <div className="space-y-6">
            {/* Balance cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>Total Fees Collected</div>
                <div className="text-2xl font-bold" style={{ color: GOLD }}>{loading ? '—' : fmt(totalFees)}</div>
                <div className="text-[11px] mt-1" style={{ color: '#6e6e73' }}>10% of all ticket sales</div>
              </div>
              <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>Total Withdrawn</div>
                <div className="text-2xl font-bold text-gray-900">{fmt(totalWithdrawn)}</div>
                <div className="text-[11px] mt-1" style={{ color: '#6e6e73' }}>{withdrawals.length} withdrawal{withdrawals.length !== 1 ? 's' : ''}</div>
              </div>
              <div className="rounded-xl p-5 flex flex-col justify-between" style={{ background: '#f0fdf4', border: `1px solid #1a2a00` }}>
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#16a34a' }}>Available to Withdraw</div>
                  <div className="text-2xl font-bold" style={{ color: '#16a34a' }}>{loading ? '—' : fmt(availableToWithdraw)}</div>
                </div>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={availableToWithdraw <= 0}
                  className="mt-4 w-full py-2 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-30"
                  style={{ background: '#16a34a', color: '#fff' }}>
                  Withdraw {loading ? '' : fmt(availableToWithdraw)}
                </button>
              </div>
            </div>

            {/* Fee breakdown by event */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              <div className="px-6 py-3" style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs font-semibold text-gray-900">Fee Breakdown by Event</span>
              </div>
              <table className="w-full text-xs" style={{ background: BG }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['Event', 'App', 'Tickets', 'Gross Revenue', 'Fee (10%)'].map(h => (
                      <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center" style={{ color: '#6e6e73' }}>Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center" style={{ color: '#6e6e73' }}>No data yet</td></tr>
                  ) : filtered.map(e => (
                    <tr key={e.eventId} style={{ borderBottom: '1px solid #141414' }}>
                      <td className="px-5 py-3 font-medium text-gray-900">{e.eventName}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{e.source}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{e.tickets}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{fmt(e.gross)}</td>
                      <td className="px-5 py-3 font-semibold" style={{ color: GOLD }}>{fmt(e.fees)}</td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td className="px-5 py-3 font-semibold text-gray-900" colSpan={3}>Total</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{fmt(totalGross)}</td>
                      <td className="px-5 py-3 font-semibold" style={{ color: GOLD }}>{fmt(totalFees)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Withdrawal log */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              <div className="px-6 py-3" style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs font-semibold text-gray-900">Withdrawal History</span>
              </div>
              {withdrawals.length === 0 ? (
                <div className="px-6 py-10 text-xs text-center" style={{ color: '#6e6e73', background: BG }}>No withdrawals yet</div>
              ) : (
                <table className="w-full text-xs" style={{ background: BG }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                      {['Date', 'Amount', 'Note'].map(h => (
                        <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...withdrawals].reverse().map(w => (
                      <tr key={w.id} style={{ borderBottom: '1px solid #141414' }}>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>
                          {new Date(w.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-5 py-3 font-semibold" style={{ color: '#16a34a' }}>{fmt(w.amount)}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{w.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Withdraw modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="rounded-2xl p-8 w-full max-w-sm" style={{ background: '#ffffff', border: `1px solid ${BORDER}` }}>
            <h2 className="text-sm font-bold text-gray-900 mb-1">Withdraw Booking Fees</h2>
            <p className="text-xs mb-6" style={{ color: '#6e6e73' }}>
              This will record a withdrawal of <span style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(availableToWithdraw)}</span> from your collected booking fees.
            </p>
            <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#6e6e73' }}>Note (optional)</label>
            <input
              value={withdrawNote}
              onChange={e => setWithdrawNote(e.target.value)}
              placeholder="e.g. Bank transfer 15 Jun"
              className="w-full rounded-lg px-4 py-3 text-sm text-gray-900 outline-none mb-6"
              style={{ background: '#f5f5f7', border: `1px solid #2a2a2a` }}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowWithdrawModal(false)}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                style={{ background: '#f5f5f7', color: '#6e6e73', border: `1px solid #2a2a2a` }}>
                Cancel
              </button>
              <button onClick={handleWithdraw}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                style={{ background: '#16a34a', color: '#fff' }}>
                Confirm Withdrawal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
