'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { FirestoreTicket } from '@/lib/types'

function fmt(pence: number) {
  return '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

const STATUS_OPTIONS = ['All', 'valid', 'used', 'cancelled', 'refunded']

interface DrinksVoucher {
  id: string
  userId: string
  userEmail: string
  userName: string
  eventId: string
  eventName: string
  packageName: string
  items: string[]
  priceInPence: number
  status: string
  redeemedAt?: { seconds: number }
  createdAt?: { seconds: number }
}

export default function TicketsPage() {
  const [tab, setTab] = useState<'tickets' | 'drinks'>('tickets')

  // Tickets state
  const [tickets, setTickets] = useState<FirestoreTicket[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [ticketsLoading, setTicketsLoading] = useState(true)

  // Drinks state
  const [vouchers, setVouchers] = useState<DrinksVoucher[]>([])
  const [drinksSearch, setDrinksSearch] = useState('')
  const [drinksLoading, setDrinksLoading] = useState(true)

  useEffect(() => {
    getDocs(query(collection(db, 'tickets'), orderBy('createdAt', 'desc')))
      .then(snap => setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreTicket))))
      .finally(() => setTicketsLoading(false))
  }, [])

  useEffect(() => {
    getDocs(query(collection(db, 'drinks_vouchers'), orderBy('createdAt', 'desc')))
      .then(snap => setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() } as DrinksVoucher))))
      .catch(() => setVouchers([]))
      .finally(() => setDrinksLoading(false))
  }, [])

  const filteredTickets = tickets.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !q || t.userName.toLowerCase().includes(q) || t.userEmail.toLowerCase().includes(q) ||
      t.eventName.toLowerCase().includes(q) || t.tierName.toLowerCase().includes(q) || t.qrCode.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'All' || t.status === statusFilter
    return matchSearch && matchStatus
  })

  const filteredVouchers = vouchers.filter(v => {
    const q = drinksSearch.toLowerCase()
    return !q || v.userName?.toLowerCase().includes(q) || v.userEmail?.toLowerCase().includes(q) ||
      v.eventName?.toLowerCase().includes(q) || v.packageName?.toLowerCase().includes(q)
  })

  const totalRevenue = filteredTickets.reduce((s, t) => t.status !== 'cancelled' && t.status !== 'refunded' ? s + t.tierPriceInPence : s, 0)

  const statusStyle = (s: string) => {
    if (s === 'used' || s === 'redeemed') return { bg: '#dcfce7', color: '#16a34a' }
    if (s === 'cancelled') return { bg: '#fee2e2', color: '#dc2626' }
    if (s === 'refunded') return { bg: '#ede9fe', color: '#7c3aed' }
    return { bg: '#f0f0f2', color: '#111111' }
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>
      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <div>
          <h1 className="text-base font-bold text-gray-900">Tickets & Drinks</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>
            {tab === 'tickets'
              ? `${filteredTickets.length} ticket${filteredTickets.length !== 1 ? 's' : ''} · ${fmt(totalRevenue)} revenue`
              : `${filteredVouchers.length} drinks voucher${filteredVouchers.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tab === 'tickets' ? (
            <>
              {STATUS_OPTIONS.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-all"
                  style={{
                    background: statusFilter === s ? '#111111' : '#ffffff',
                    color: statusFilter === s ? '#ffffff' : '#6e6e73',
                    border: `1px solid ${statusFilter === s ? '#111111' : '#e5e5ea'}`,
                  }}>
                  {s}
                </button>
              ))}
              <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none"
                style={{ background: '#ffffff', border: '1px solid #e5e5ea', width: 180 }} />
            </>
          ) : (
            <input placeholder="Search…" value={drinksSearch} onChange={e => setDrinksSearch(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none"
              style={{ background: '#ffffff', border: '1px solid #e5e5ea', width: 180 }} />
          )}
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-0 px-8 pt-5" style={{ borderBottom: '1px solid #f0f0f2' }}>
        {[
          { key: 'tickets', label: 'Tickets' },
          { key: 'drinks', label: 'Drinks Vouchers' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as 'tickets' | 'drinks')}
            className="px-5 pb-3 text-xs font-semibold transition-all relative"
            style={{ color: tab === t.key ? '#111111' : '#6e6e73' }}>
            {t.label}
            {tab === t.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: '#111111' }} />
            )}
          </button>
        ))}
      </div>

      <div className="p-8">
        {/* Tickets table */}
        {tab === 'tickets' && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
            {ticketsLoading ? (
              <div className="px-6 py-12 text-xs text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>Loading…</div>
            ) : (
              <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f2' }}>
                    {['Customer', 'Event', 'Ticket Type', 'Amount', 'Status', 'QR Code', 'Date'].map(h => (
                      <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center" style={{ color: '#6e6e73' }}>No tickets found</td></tr>
                  ) : filteredTickets.map(t => {
                    const ss = statusStyle(t.status)
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f2' }}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900">{t.userName}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>{t.userEmail}</div>
                        </td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{t.eventName}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{t.tierName}</td>
                        <td className="px-5 py-3 font-semibold" style={{ color: '#111111' }}>{fmt(t.tierPriceInPence)}</td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                            style={{ background: ss.bg, color: ss.color }}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-mono text-[10px]" style={{ color: '#6e6e73' }}>{t.qrCode?.slice(0, 10)}…</span>
                        </td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>
                          {t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Drinks vouchers table */}
        {tab === 'drinks' && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
            {drinksLoading ? (
              <div className="px-6 py-12 text-xs text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>Loading…</div>
            ) : filteredVouchers.length === 0 ? (
              <div className="px-6 py-12 text-xs text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>No drinks vouchers found</div>
            ) : (
              <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f2' }}>
                    {['Customer', 'Event', 'Package', 'Items', 'Amount', 'Status', 'Date'].map(h => (
                      <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredVouchers.map(v => {
                    const ss = statusStyle(v.status)
                    return (
                      <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f2' }}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900">{v.userName}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>{v.userEmail}</div>
                        </td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{v.eventName}</td>
                        <td className="px-5 py-3 font-medium text-gray-900">{v.packageName}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>
                          {v.items?.join(', ') || '—'}
                        </td>
                        <td className="px-5 py-3 font-semibold" style={{ color: '#111111' }}>{fmt(v.priceInPence ?? 0)}</td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                            style={{ background: ss.bg, color: ss.color }}>
                            {v.status}
                          </span>
                        </td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>
                          {v.createdAt ? new Date(v.createdAt.seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
