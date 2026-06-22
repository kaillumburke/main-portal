'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { FirestoreTicket } from '@/lib/types'

const S = {
  bg: '#f5f5f7',
  border: '#e5e5ea',
  cardBg: '#ffffff',
  sectionLabel: '#aeaeb2',
  textPrimary: '#111111',
  textSecondary: '#6e6e73',
  blue: '#111111',
}

function fmt(pence: number) {
  return '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

function PlusIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
}
function PersonIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
function TicketIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>
}

const apps = [
  {
    id: 'mansion',
    name: 'MANSION NIGHTCLUB',
    type: 'Nightclub · Liverpool',
    href: '/mansion/dashboard',
    color: '#C9A84C',
    logo: '/mansion-logo.png',
  },
]

export default function HomePage() {
  const router = useRouter()
  const [stats, setStats] = useState({ tickets: 0, gross: 0, events: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'tickets'), orderBy('createdAt', 'desc'))),
      getDocs(collection(db, 'events')),
    ]).then(([ticketSnap, eventSnap]) => {
      const tickets = ticketSnap.docs.map(d => d.data() as FirestoreTicket)
      const active = tickets.filter(t => t.status !== 'cancelled' && t.status !== 'refunded')
      setStats({
        tickets: active.length,
        gross: active.reduce((s, t) => s + t.tierPriceInPence, 0),
        events: eventSnap.size,
      })
    }).finally(() => setLoading(false))
  }, [])

  const filtered = apps.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ background: S.bg, minHeight: '100%' }}>

      {/* Platform banner */}
      <div className="mx-6 mt-6 rounded-xl px-6 py-5 flex items-center justify-between"
        style={{ background: S.cardBg, border: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-base font-semibold" style={{ color: S.textPrimary }}>Connect.</div>
            <div className="text-[12px] mt-0.5 flex items-center gap-3" style={{ color: S.textSecondary }}>
              <span>✓ {loading ? '—' : stats.tickets} tickets sold</span>
              <span>✓ {loading ? '—' : stats.events} events</span>
              <span>✓ {loading ? '—' : fmt(stats.gross)} gross</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => router.push('/apps')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium"
          style={{ background: '#111111', color: '#fff' }}>
          <PlusIcon /> Add App
        </button>
      </div>

      {/* Tabs + search */}
      <div className="px-6 mt-5 flex items-center justify-between">
        <div className="flex items-center gap-0">
          {['Active', 'Inactive'].map((tab, i) => (
            <button key={tab}
              className="px-4 py-1.5 text-[13px] font-medium rounded-md mr-1 transition-all"
              style={{
                background: i === 0 ? '#ffffff' : 'transparent',
                color: i === 0 ? S.textPrimary : S.textSecondary,
                border: i === 0 ? `1px solid ${S.border}` : '1px solid transparent',
              }}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md"
            style={{ background: '#ffffff', border: `1px solid ${S.border}` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search apps…"
              className="bg-transparent outline-none text-[12px] w-36"
              style={{ color: S.textPrimary }}
            />
          </div>
          <button
            onClick={() => router.push('/apps')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold"
            style={{ background: S.blue, color: '#fff' }}>
            <PlusIcon /> New App
          </button>
        </div>
      </div>

      {/* App cards grid */}
      <div className="px-6 mt-4 grid grid-cols-3 gap-3 pb-8">
        {filtered.map(app => (
          <button key={app.id} onClick={() => router.push(app.href)}
            className="text-left rounded-xl overflow-hidden transition-all group"
            style={{ background: '#111111', border: '1px solid #222222' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#444444')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#222222')}>

            <div className="flex items-start p-4 gap-4">
              {/* Thumbnail */}
              <div className="w-[72px] h-[72px] rounded-lg shrink-0 flex items-center justify-center overflow-hidden"
                style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <Image src={app.logo} alt={app.name} width={72} height={72} style={{ width: 72, height: 72, objectFit: 'cover' }} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="text-[12px] font-semibold tracking-wide mb-0.5" style={{ color: '#ffffff' }}>
                  {app.name}
                </div>
                <div className="text-[11px] mb-3" style={{ color: '#888888' }}>
                  {app.type}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-[11px]" style={{ color: '#888888' }}>
                    <TicketIcon />
                    <span>{loading ? '—' : stats.tickets} tickets</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px]" style={{ color: '#888888' }}>
                    <PersonIcon />
                    <span>{loading ? '—' : stats.events} events</span>
                  </div>
                </div>
              </div>

              {/* Status badge */}
              <div className="shrink-0">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: '#dcfce7', color: '#16a34a' }}>
                  Active
                </span>
              </div>
            </div>
          </button>
        ))}

        {/* Add app placeholder */}
        <button onClick={() => router.push('/apps')}
          className="rounded-xl flex flex-col items-center justify-center transition-all"
          style={{ background: 'transparent', border: `1px dashed #d1d1d6`, minHeight: 104 }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#aeaeb2')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#d1d1d6')}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center mb-2"
            style={{ background: '#f0f0f2', color: '#aeaeb2' }}>
            <PlusIcon />
          </div>
          <div className="text-[12px]" style={{ color: '#aeaeb2' }}>Add App</div>
        </button>
      </div>
    </div>
  )
}
