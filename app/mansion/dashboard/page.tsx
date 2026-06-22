'use client'

import React, { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { FirestoreTicket, AppEvent } from '@/lib/types'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line,
} from 'recharts'

function fmt(pence: number) {
  return '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })
}
function fmtShort(pence: number) {
  if (pence >= 100000) return '£' + (pence / 100000).toFixed(1) + 'k'
  return '£' + (pence / 100).toFixed(0)
}

interface TierStat { name: string; sold: number; revenue: number; priceInPence: number }
interface EventStat {
  id: string; name: string; shortName: string
  ticketsSold: number; grossRevenue: number; promoterRevenue: number
  bookingFees: number; attendance: number; date: number
  tiers: Map<string, TierStat>
}

export default function DashboardPage() {
  const [eventStats, setEventStats] = useState<EventStat[]>([])
  const [tickets, setTickets] = useState<FirestoreTicket[]>([])
  const [salesOverTime, setSalesOverTime] = useState<{ date: string; sales: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [ticketSnap, eventSnap] = await Promise.all([
          getDocs(query(collection(db, 'tickets'), orderBy('createdAt', 'asc'))),
          getDocs(collection(db, 'events')),
        ])
        const allTickets = ticketSnap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreTicket))
        const allEvents = eventSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppEvent))
        setTickets(allTickets)

        const statsMap = new Map<string, EventStat>()
        allEvents.forEach(e => statsMap.set(e.id, {
          id: e.id, name: e.name,
          shortName: e.name.length > 16 ? e.name.slice(0, 16) + '…' : e.name,
          ticketsSold: 0, grossRevenue: 0, promoterRevenue: 0,
          bookingFees: 0, attendance: 0, date: e.date?.seconds ?? 0,
          tiers: new Map(),
        }))

        allTickets.forEach(t => {
          if (t.status === 'cancelled' || t.status === 'refunded') return
          const stat = statsMap.get(t.eventId) ?? {
            id: t.eventId, name: t.eventName,
            shortName: t.eventName.length > 16 ? t.eventName.slice(0, 16) + '…' : t.eventName,
            ticketsSold: 0, grossRevenue: 0, promoterRevenue: 0, bookingFees: 0, attendance: 0, date: 0,
            tiers: new Map<string, TierStat>(),
          }
          stat.ticketsSold++
          stat.grossRevenue += t.tierPriceInPence
          stat.bookingFees += Math.round(t.tierPriceInPence * 0.10)
          stat.promoterRevenue += t.tierPriceInPence - Math.round(t.tierPriceInPence * 0.10)
          if (t.status === 'used') stat.attendance++
          const tier = stat.tiers.get(t.tierId) ?? { name: t.tierName, sold: 0, revenue: 0, priceInPence: t.tierPriceInPence }
          tier.sold++; tier.revenue += t.tierPriceInPence
          stat.tiers.set(t.tierId, tier)
          statsMap.set(t.eventId, stat)
        })

        setEventStats(Array.from(statsMap.values()).filter(s => s.ticketsSold > 0).sort((a, b) => a.date - b.date))

        const dayMap = new Map<string, number>()
        allTickets.forEach(t => {
          if (!t.createdAt) return
          const d = new Date(t.createdAt.seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
          dayMap.set(d, (dayMap.get(d) ?? 0) + 1)
        })
        setSalesOverTime(Array.from(dayMap.entries()).map(([date, sales]) => ({ date, sales })))
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const totalRevenue = tickets.reduce((s, t) => s + t.tierPriceInPence, 0)
  const totalSold = tickets.filter(t => t.status !== 'cancelled' && t.status !== 'refunded').length
  const totalUsed = tickets.filter(t => t.status === 'used').length
  const totalFees = Math.round(totalRevenue * 0.10)

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>
      {/* Page header */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <div>
          <h1 className="text-base font-bold text-gray-900">Event Dashboard</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>Mansion Nightclub Liverpool</p>
        </div>
        <a href="/dashboard/events" className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: '#111111', color: '#fff' }}>
          + Add Event
        </a>
      </div>

      <div className="p-8 space-y-6">
        {loading ? (
          <div className="text-xs" style={{ color: '#6e6e73' }}>Loading…</div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Revenue', value: fmt(totalRevenue), sub: 'gross' },
                { label: 'Tickets Sold', value: totalSold.toString(), sub: `${eventStats.length} events` },
                { label: 'Attendance', value: totalUsed.toString(), sub: totalSold ? `${Math.round(totalUsed / totalSold * 100)}% rate` : '—' },
              ].map(c => (
                <div key={c.label} className="rounded-xl p-5" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                  <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>{c.label}</div>
                  <div className="text-2xl font-bold" style={{ color: '#111111' }}>{c.value}</div>
                  <div className="text-[11px] mt-1" style={{ color: '#6e6e73' }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* Charts */}
            {eventStats.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl p-5" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                  <div className="text-xs font-semibold text-gray-900 mb-4">Revenue Per Event</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={eventStats} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                      <XAxis dataKey="shortName" tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtShort} tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip contentStyle={{ background: '#f0f0f2', border: '1px solid #e5e5ea', borderRadius: 8, color: '#111111', fontSize: 12 }}
                        formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']} labelStyle={{ color: '#111111' }} />
                      <Bar dataKey="grossRevenue" fill="#111111" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl p-5" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                  <div className="text-xs font-semibold text-gray-900 mb-4">Daily Sales</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={salesOverTime} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                      <XAxis dataKey="date" tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ background: '#f0f0f2', border: '1px solid #e5e5ea', borderRadius: 8, color: '#111111', fontSize: 12 }}
                        formatter={(v) => [v, 'Tickets']} labelStyle={{ color: '#111111' }} />
                      <Line type="monotone" dataKey="sales" stroke="#111111'" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Event breakdown table */}
            {eventStats.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
                <div className="px-6 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
                  <span className="text-xs font-semibold text-gray-900">Event Breakdown</span>
                </div>
                <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #f0f0f2' }}>
                      {['Event / Tier', 'Allocation', 'Price', 'Sales', 'Gross', 'Payout'].map(h => (
                        <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {eventStats.map(e => (
                      <React.Fragment key={e.id}>
                        {/* Event row */}
                        <tr key={e.id} style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
                          <td className="px-5 py-3 font-semibold text-gray-900">{e.name}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#f0f0f2', width: 60 }}>
                                <div className="h-full rounded-full" style={{ background: '#111111', width: `${Math.min(100, (e.ticketsSold / 500) * 100)}%` }} />
                              </div>
                              <span style={{ color: '#6e6e73' }}>{e.ticketsSold}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3" style={{ color: '#6e6e73' }}>—</td>
                          <td className="px-5 py-3 font-semibold text-gray-900">{e.ticketsSold}</td>
                          <td className="px-5 py-3 font-semibold" style={{ color: '#111111' }}>{fmt(e.grossRevenue)}</td>
                          <td className="px-5 py-3 font-semibold text-gray-900">{fmt(e.promoterRevenue)}</td>
                        </tr>
                        {/* Tier rows */}
                        {Array.from(e.tiers?.values() ?? []).map((tier, i, arr) => (
                          <tr key={tier.name} style={{ borderBottom: i === arr.length - 1 ? '1px solid #1f1f1f' : '1px solid #141414', background: '#f5f5f7' }}>
                            <td className="px-5 py-2" style={{ color: '#6e6e73', paddingLeft: 32 }}>
                              <span style={{ color: '#2a2a2a', marginRight: 6 }}>└</span>{tier.name}
                            </td>
                            <td className="px-5 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-1 rounded-full overflow-hidden" style={{ background: '#f0f0f2', width: 50 }}>
                                  <div className="h-full rounded-full" style={{ background: '#8B6914', width: `${Math.min(100, (tier.sold / 100) * 100)}%` }} />
                                </div>
                                <span style={{ color: '#6e6e73' }}>{tier.sold}</span>
                              </div>
                            </td>
                            <td className="px-5 py-2" style={{ color: '#6e6e73' }}>{fmt(tier.priceInPence)}</td>
                            <td className="px-5 py-2" style={{ color: '#6e6e73' }}>{tier.sold}</td>
                            <td className="px-5 py-2" style={{ color: '#6e6e73' }}>{fmt(tier.revenue)}</td>
                            <td className="px-5 py-2" style={{ color: '#6e6e73' }}>{fmt(tier.revenue - Math.round(tier.revenue * 0.10))}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid #e5e5ea', background: '#ffffff' }}>
                      <td className="px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#6e6e73' }}>Total</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{eventStats.reduce((s, e) => s + e.ticketsSold, 0)}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>—</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{eventStats.reduce((s, e) => s + e.ticketsSold, 0)}</td>
                      <td className="px-5 py-3 font-semibold" style={{ color: '#111111' }}>{fmt(eventStats.reduce((s, e) => s + e.grossRevenue, 0))}</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{fmt(eventStats.reduce((s, e) => s + e.promoterRevenue, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {eventStats.length === 0 && (
              <div className="rounded-xl p-16 text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                <div className="text-xs" style={{ color: '#6e6e73' }}>No ticket sales yet — create an event to get started</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
