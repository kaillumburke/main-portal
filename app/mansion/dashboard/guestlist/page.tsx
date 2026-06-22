'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'

interface GuestEntry {
  id: string
  name: string
  email: string
  guestCount: number
  addedBy: string
  checkedIn: boolean
  eventId: string
  eventName: string
  notes?: string
  createdAt?: { seconds: number }
}

interface EventOption {
  id: string
  name: string
  date: { seconds: number }
}

const emptyForm = { name: '', email: '', guestCount: 1, notes: '', eventId: '' }

export default function GuestlistPage() {
  const { profile } = useAuth()
  const [guests, setGuests] = useState<GuestEntry[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const evSnap = await getDocs(query(collection(db, 'events')))
      const evList: EventOption[] = evSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as EventOption))
        .filter(e => (e as any).status?.toLowerCase() === 'published')
        .sort((a, b) => a.date.seconds - b.date.seconds)
      setEvents(evList)

      const allGuests: GuestEntry[] = []
      await Promise.all(evList.map(async ev => {
        const snap = await getDocs(query(collection(db, 'events', ev.id, 'guestList'), orderBy('createdAt', 'desc')))
        snap.docs.forEach(d => {
          allGuests.push({ id: d.id, eventId: ev.id, eventName: ev.name, ...d.data() } as GuestEntry)
        })
      }))
      allGuests.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setGuests(allGuests)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.name.trim() || !form.eventId) return
    setSaving(true)
    try {
      const ev = events.find(e => e.id === form.eventId)
      await addDoc(collection(db, 'events', form.eventId, 'guestList'), {
        name: form.name.trim(),
        email: form.email.trim(),
        guestCount: form.guestCount,
        notes: form.notes.trim(),
        addedBy: profile ? `${profile.firstName} ${profile.lastName}` : 'Manager',
        checkedIn: false,
        eventName: ev?.name ?? '',
        createdAt: Timestamp.now(),
      })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const toggleCheckIn = async (guest: GuestEntry) => {
    await updateDoc(doc(db, 'events', guest.eventId, 'guestList', guest.id), { checkedIn: !guest.checkedIn })
    load()
  }

  const handleDelete = async (guest: GuestEntry) => {
    await deleteDoc(doc(db, 'events', guest.eventId, 'guestList', guest.id))
    load()
  }

  const filtered = guests.filter(g => {
    const q = search.toLowerCase()
    return !q || g.name?.toLowerCase().includes(q) || g.email?.toLowerCase().includes(q) || g.addedBy?.toLowerCase().includes(q) || g.eventName?.toLowerCase().includes(q)
  })

  const checkedIn = guests.filter(g => g.checkedIn).length
  const totalGuests = guests.reduce((s, g) => s + (g.guestCount || 1), 0)

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <div>
          <h1 className="text-base font-bold text-gray-900">VIP Guestlist</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>
            {checkedIn}/{guests.length} checked in · {totalGuests} total guests
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            placeholder="Search guests…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none"
            style={{ background: '#ffffff', border: '1px solid #e5e5ea', width: 180 }}
          />
          <button onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: '#111111', color: '#fff' }}>
            + Add Guest
          </button>
        </div>
      </div>

      <div className="p-8 space-y-4">
        {showForm && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
            <div className="px-6 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
              <span className="text-xs font-semibold text-gray-900">Add to Guestlist</span>
              <button onClick={() => setShowForm(false)} className="text-xs" style={{ color: '#6e6e73' }}>✕</button>
            </div>
            <div className="p-6 grid grid-cols-5 gap-4 items-end" style={{ background: '#f5f5f7' }}>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: '#6e6e73' }}>Event *</label>
                <select value={form.eventId} onChange={e => setForm(p => ({ ...p, eventId: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                  <option value="">Select event…</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: '#6e6e73' }}>Name *</label>
                <input type="text" placeholder="Full name"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: '#6e6e73' }}>Email</label>
                <input type="email" placeholder="email@example.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: '#6e6e73' }}>Guest Count</label>
                <input type="number" min="1" max="20"
                  value={form.guestCount}
                  onChange={e => setForm(p => ({ ...p, guestCount: parseInt(e.target.value) || 1 }))}
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: '#6e6e73' }}>Notes</label>
                <input type="text" placeholder="e.g. Birthday, VIP booth"
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
              </div>
              <div className="col-span-5 flex gap-3 pt-1">
                <button onClick={handleAdd} disabled={saving || !form.name.trim() || !form.eventId}
                  className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
                  style={{ background: '#111111', color: '#fff' }}>
                  {saving ? 'Adding…' : 'Add to Guestlist'}
                </button>
                <button onClick={() => { setShowForm(false); setForm(emptyForm) }}
                  className="px-4 py-2 rounded-lg text-xs"
                  style={{ background: '#f0f0f2', color: '#6e6e73' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
          {loading ? (
            <div className="px-6 py-12 text-xs text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-xs text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>
              {guests.length === 0 ? 'No guests yet — add someone to get started' : 'No guests match your search'}
            </div>
          ) : (
            <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f0f2' }}>
                  {['Name', 'Event', 'Email', 'Guests', 'Notes', 'Added By', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(g => (
                  <tr key={`${g.eventId}-${g.id}`} style={{ borderBottom: '1px solid #f0f0f2' }}>
                    <td className="px-5 py-3 font-medium text-gray-900" style={{ textDecoration: g.checkedIn ? 'line-through' : 'none', opacity: g.checkedIn ? 0.4 : 1 }}>
                      {g.name}
                    </td>
                    <td className="px-5 py-3 font-medium" style={{ color: '#C9A84C', fontSize: 11 }}>{g.eventName}</td>
                    <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{g.email || '—'}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900">+{g.guestCount || 1}</td>
                    <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{g.notes || '—'}</td>
                    <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{g.addedBy}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => toggleCheckIn(g)}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all"
                        style={{ background: g.checkedIn ? '#dcfce7' : '#fef9ee', color: g.checkedIn ? '#16a34a' : '#C9A84C' }}>
                        {g.checkedIn ? 'Checked in' : 'Expected'}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => handleDelete(g)}
                        className="text-[10px] transition-colors" style={{ color: '#d0d0d5' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#d0d0d5')}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
