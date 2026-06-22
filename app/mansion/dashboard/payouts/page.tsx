'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { FirestoreTicket } from '@/lib/types'

function fmt(pence: number) {
  return '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

interface PromoterRow {
  name: string
  email: string
  eventName: string
  eventId: string
  ticketCount: number
  grossRevenue: number
  promoterRevenue: number
  bookingFees: number
}

export default function PayoutsPage() {
  const [rows, setRows] = useState<PromoterRow[]>([])
  const [paid, setPaid] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('mansion_paid_payouts')
    if (stored) setPaid(new Set(JSON.parse(stored)))

    getDocs(query(collection(db, 'tickets'), orderBy('createdAt', 'desc')))
      .then(snap => {
        const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreTicket))
        // Group by eventId
        const map = new Map<string, PromoterRow>()
        tickets.forEach(t => {
          if (t.status === 'cancelled' || t.status === 'refunded') return
          const key = t.eventId
          const existing = map.get(key)
          const gross = t.tierPriceInPence
          const bookingFee = Math.round(gross * 0.10)
          const promoterCut = gross - bookingFee
          if (existing) {
            existing.ticketCount++
            existing.grossRevenue += gross
            existing.bookingFees += bookingFee
            existing.promoterRevenue += promoterCut
          } else {
            map.set(key, {
              name: 'Promoter',
              email: '',
              eventName: t.eventName,
              eventId: t.eventId,
              ticketCount: 1,
              grossRevenue: gross,
              bookingFees: bookingFee,
              promoterRevenue: promoterCut,
            })
          }
        })
        setRows(Array.from(map.values()))
      })
      .finally(() => setLoading(false))
  }, [])

  const togglePaid = (eventId: string) => {
    setPaid(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      localStorage.setItem('mansion_paid_payouts', JSON.stringify(Array.from(next)))
      return next
    })
  }

  const totalOwed = rows.filter(r => !paid.has(r.eventId)).reduce((s, r) => s + r.promoterRevenue, 0)
  const totalFees = rows.reduce((s, r) => s + r.bookingFees, 0)

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>
      <div className="px-8 py-5" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <h1 className="text-base font-bold text-gray-900">Payouts</h1>
        <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>
          {fmt(totalOwed)} outstanding
        </p>
      </div>

      <div className="p-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Gross', value: fmt(rows.reduce((s, r) => s + r.grossRevenue, 0)), gold: false },
            { label: 'Pending Payouts', value: fmt(totalOwed), gold: false },
            { label: 'Total Paid Out', value: fmt(rows.filter(r => paid.has(r.eventId)).reduce((s, r) => s + r.promoterRevenue, 0)), gold: true },
          ].map(c => (
            <div key={c.label} className="rounded-xl p-5" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>{c.label}</div>
              <div className="text-2xl font-bold" style={{ color: c.gold ? '#111111' : '#111111' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
          {loading ? (
            <div className="px-6 py-12 text-xs text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-xs text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>No payout data yet</div>
          ) : (
            <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f0f2' }}>
                  {['Event', 'Tickets', 'Gross', 'Payout', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isPaid = paid.has(r.eventId)
                  return (
                    <tr key={r.eventId} style={{ borderBottom: '1px solid #f0f0f2' }}>
                      <td className="px-5 py-3 font-medium text-gray-900">{r.eventName}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{r.ticketCount}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{fmt(r.grossRevenue)}</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{fmt(r.promoterRevenue)}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                          style={{ background: isPaid ? '#0a2010' : '#2e1a00', color: isPaid ? '#4ade80' : '#f97316' }}>
                          {isPaid ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => togglePaid(r.eventId)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                          style={{ background: '#f0f0f2', color: '#6e6e73', border: '1px solid #e5e5ea' }}>
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
    </div>
  )
}
