'use client'

import { useEffect, useState, useRef } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { DBUser, FirestoreTicket } from '@/lib/types'

function fmt(pence: number) {
  return '£' + (pence / 100).toFixed(2)
}

// ── Export helpers ──────────────────────────────────────────────

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function toCSV(rows: CustomerRow[]) {
  const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Date of Birth', 'Role', 'Tickets', 'Total Spend (£)', 'Last Purchase', 'Events Attended', 'Joined']
  const lines = rows.map(r => [
    r.firstName,
    r.lastName,
    r.email,
    r.phone ?? '',
    r.dob ?? '',
    r.role,
    r.ticketCount,
    (r.totalSpend / 100).toFixed(2),
    r.lastPurchase ? new Date(r.lastPurchase.seconds * 1000).toLocaleDateString('en-GB') : '',
    r.events.join(' | '),
    r.createdAt ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('en-GB') : '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  return [headers.map(h => `"${h}"`).join(','), ...lines].join('\r\n')
}

function toJSON(rows: CustomerRow[]) {
  return JSON.stringify(rows.map(r => ({
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone ?? null,
    dob: r.dob ?? null,
    role: r.role,
    ticketCount: r.ticketCount,
    totalSpendPence: r.totalSpend,
    totalSpendGBP: parseFloat((r.totalSpend / 100).toFixed(2)),
    lastPurchase: r.lastPurchase ? new Date(r.lastPurchase.seconds * 1000).toISOString() : null,
    eventsAttended: r.events,
    joinedAt: r.createdAt ? new Date(r.createdAt.seconds * 1000).toISOString() : null,
  })), null, 2)
}

// Basic XLSX-compatible XML (opens natively in Excel / Numbers)
function toXLSX(rows: CustomerRow[]) {
  const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Date of Birth', 'Role', 'Tickets', 'Total Spend (£)', 'Last Purchase', 'Events Attended', 'Joined']
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const cell = (v: string | number) => `<Cell><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${esc(String(v))}</Data></Cell>`
  const headerRow = `<Row>${headers.map(h => cell(h)).join('')}</Row>`
  const dataRows = rows.map(r => `<Row>${[
    r.firstName, r.lastName, r.email, r.phone ?? '', r.dob ?? '', r.role,
    r.ticketCount,
    parseFloat((r.totalSpend / 100).toFixed(2)),
    r.lastPurchase ? new Date(r.lastPurchase.seconds * 1000).toLocaleDateString('en-GB') : '',
    r.events.join(' | '),
    r.createdAt ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('en-GB') : '',
  ].map(v => cell(v)).join('')}</Row>`).join('')
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Customers">
    <Table>${headerRow}${dataRows}</Table>
  </Worksheet>
</Workbook>`
}

interface CustomerRow extends DBUser {
  ticketCount: number
  totalSpend: number
  lastPurchase: { seconds: number } | null
  events: string[]
}

export default function DataPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'name' | 'spend' | 'tickets' | 'joined'>('spend')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [customerTickets, setCustomerTickets] = useState<Record<string, FirestoreTicket[]>>({})
  const [showExport, setShowExport] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    let usersData: DBUser[] = []
    let ticketsData: FirestoreTicket[] = []
    let usersReady = false
    let ticketsReady = false

    function rebuild() {
      if (!usersReady || !ticketsReady) return

      const byUser: Record<string, FirestoreTicket[]> = {}
      ticketsData.forEach(t => {
        if (!byUser[t.userId]) byUser[t.userId] = []
        byUser[t.userId].push(t)
      })
      setCustomerTickets(byUser)

      const rows: CustomerRow[] = usersData.map(user => {
        const userTickets = (byUser[user.id] ?? []).filter(t => t.status !== 'cancelled' && t.status !== 'refunded')
        const spend = userTickets.reduce((s, t) => s + t.tierPriceInPence, 0)
        const sorted = [...userTickets].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        const events = [...new Set(userTickets.map(t => t.eventName))]
        return { ...user, ticketCount: userTickets.length, totalSpend: spend, lastPurchase: sorted[0]?.createdAt ?? null, events }
      })

      setCustomers(rows)
      setLoading(false)
    }

    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), orderBy('createdAt', 'desc')),
      snap => { usersData = snap.docs.map(d => ({ id: d.id, ...d.data() } as DBUser)); usersReady = true; rebuild() }
    )

    const unsubTickets = onSnapshot(
      query(collection(db, 'tickets'), orderBy('createdAt', 'desc')),
      snap => { ticketsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreTicket)); ticketsReady = true; rebuild() }
    )

    return () => { unsubUsers(); unsubTickets() }
  }, [])

  const filtered = customers
    .filter(c => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        c.firstName?.toLowerCase().includes(q) ||
        c.lastName?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      )
    })
    .sort((a, b) => {
      if (sort === 'spend') return b.totalSpend - a.totalSpend
      if (sort === 'tickets') return b.ticketCount - a.ticketCount
      if (sort === 'joined') return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    })

  const totalCustomers = customers.length
  const totalRevenue = customers.reduce((s, c) => s + c.totalSpend, 0)
  const withDOB = customers.filter(c => c.dob).length
  const withPhone = customers.filter(c => c.phone).length

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>
      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <div>
          <h1 className="text-base font-bold text-gray-900">Customer Data</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>
            {totalCustomers} registered users · {fmt(totalRevenue)} total spend
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setShowExport(p => !p)}
              disabled={loading || filtered.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-40"
              style={{ background: '#fef9ee', color: '#111111', border: '1px solid #3a2a00' }}>
              ↓ Export
              <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-50 shadow-xl"
                style={{ background: '#ffffff', border: '1px solid #e5e5ea', minWidth: 160 }}>
                {[
                  { label: 'CSV', sub: 'Excel, Google Sheets', action: () => { downloadFile(toCSV(filtered), `mansion-customers-${Date.now()}.csv`, 'text/csv'); setShowExport(false) } },
                  { label: 'Excel (.xls)', sub: 'Native Excel format', action: () => { downloadFile(toXLSX(filtered), `mansion-customers-${Date.now()}.xls`, 'application/vnd.ms-excel'); setShowExport(false) } },
                  { label: 'JSON', sub: 'API / developer use', action: () => { downloadFile(toJSON(filtered), `mansion-customers-${Date.now()}.json`, 'application/json'); setShowExport(false) } },
                ].map(opt => (
                  <button key={opt.label} onClick={opt.action}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{ borderBottom: '1px solid #f0f0f2' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div className="text-xs font-semibold text-gray-900">{opt.label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>{opt.sub}</div>
                  </button>
                ))}
                <div className="px-4 py-2 text-[10px]" style={{ color: '#6e6e73' }}>
                  Exports {filtered.length} row{filtered.length !== 1 ? 's' : ''} (current filter)
                </div>
              </div>
            )}
          </div>

          {(['spend', 'tickets', 'joined', 'name'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-all"
              style={{
                background: sort === s ? '#C9A84C' : '#111',
                color: sort === s ? '#000' : '#666',
                border: sort === s ? 'none' : '1px solid #e5e5ea',
              }}>
              {s === 'spend' ? 'Top Spend' : s === 'tickets' ? 'Most Tickets' : s === 'joined' ? 'Newest' : 'A–Z'}
            </button>
          ))}
          <input
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none"
            style={{ background: '#ffffff', border: '1px solid #e5e5ea', width: 180 }}
          />
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Customers', value: totalCustomers.toString() },
            { label: 'Total Spend', value: fmt(totalRevenue), gold: true },
            { label: 'DOB Collected', value: `${withDOB} / ${totalCustomers}` },
            { label: 'Phone Collected', value: `${withPhone} / ${totalCustomers}` },
          ].map(c => (
            <div key={c.label} className="rounded-xl p-5" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6e73' }}>{c.label}</div>
              <div className="text-2xl font-bold" style={{ color: c.gold ? '#111111' : '#111111' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-xs" style={{ color: '#6e6e73' }}>Loading…</div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
            <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f0f2' }}>
                  {['Customer', 'Contact', 'DOB', 'Role', 'Tickets', 'Spend', 'Last Purchase', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center" style={{ color: '#6e6e73' }}>No customers found</td></tr>
                ) : filtered.map(c => {
                  const isExpanded = expandedId === c.id
                  const tickets = customerTickets[c.id] ?? []
                  const roleStyle = c.role === 'admin'
                    ? { bg: '#1a1400', color: '#111111' }
                    : { bg: '#0a1a0a', color: '#16a34a' }

                  return (
                    <>
                      <tr
                        key={c.id}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: isExpanded ? 'none' : '1px solid #141414' }}
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900">{c.firstName} {c.lastName}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>{c.id.slice(0, 8)}…</div>
                        </td>
                        <td className="px-5 py-3">
                          <div style={{ color: '#6e6e73' }}>{c.email}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>{c.phone || '—'}</div>
                        </td>
                        <td className="px-5 py-3" style={{ color: c.dob ? '#888' : '#333' }}>
                          {c.dob || <span style={{ color: '#aeaeb2' }}>Not set</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                            style={{ background: roleStyle.bg, color: roleStyle.color }}>
                            {c.role}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold text-gray-900">{c.ticketCount}</td>
                        <td className="px-5 py-3 font-semibold" style={{ color: '#111111' }}>{fmt(c.totalSpend)}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>
                          {c.lastPurchase
                            ? new Date(c.lastPurchase.seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-[10px]" style={{ color: '#6e6e73' }}>{isExpanded ? '▾' : '▸'}</td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${c.id}-expanded`} style={{ borderBottom: '1px solid #f0f0f2' }}>
                          <td colSpan={8} style={{ background: '#f5f5f7', padding: 0 }}>
                            {/* Events attended */}
                            {c.events.length > 0 && (
                              <div className="px-8 pt-4 pb-2 flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] uppercase tracking-widest mr-2" style={{ color: '#6e6e73' }}>Events</span>
                                {c.events.map(ev => (
                                  <span key={ev} className="px-2 py-0.5 rounded text-[10px]" style={{ background: '#fef9ee', color: '#111111', border: '1px solid #2a2000' }}>{ev}</span>
                                ))}
                              </div>
                            )}
                            {/* Ticket history */}
                            {tickets.length > 0 ? (
                              <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid #111' }}>
                                    {['Event', 'Ticket Type', 'Price', 'Status', 'Purchased'].map(h => (
                                      <th key={h} className="text-left px-8 py-2 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {tickets.map(t => {
                                    const ss = t.status === 'used' ? { color: '#16a34a' }
                                      : t.status === 'cancelled' || t.status === 'refunded' ? { color: '#dc2626' }
                                      : { color: '#111111' }
                                    return (
                                      <tr key={t.id} style={{ borderBottom: '1px solid #0d0d0d' }}>
                                        <td className="px-8 py-2" style={{ color: '#6e6e73' }}>{t.eventName}</td>
                                        <td className="px-8 py-2" style={{ color: '#6e6e73' }}>{t.tierName}</td>
                                        <td className="px-8 py-2" style={{ color: '#6e6e73' }}>{fmt(t.tierPriceInPence)}</td>
                                        <td className="px-8 py-2">
                                          <span className="text-[10px] font-semibold uppercase" style={ss}>{t.status}</span>
                                        </td>
                                        <td className="px-8 py-2" style={{ color: '#6e6e73' }}>
                                          {t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div className="px-8 py-4 text-xs" style={{ color: '#6e6e73' }}>No ticket purchases yet</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
