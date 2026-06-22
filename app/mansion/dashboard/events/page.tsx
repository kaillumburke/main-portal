'use client'

import { useEffect, useRef, useState } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, orderBy, query, Timestamp, onSnapshot, deleteField } from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { AppEvent } from '@/lib/types'

function fmt(pence: number) {
  return '£' + (pence / 100).toFixed(2)
}

const EVENT_PAGES_BASE = process.env.NEXT_PUBLIC_EVENT_PAGES_URL ?? 'http://localhost:3002'

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!
const ONESIGNAL_REST_KEY = process.env.NEXT_PUBLIC_ONESIGNAL_REST_KEY!

type FormStatus = 'DRAFT' | 'PUBLISHED'
type EventForm = {
  name: string
  description: string
  venue: string
  date: string
  doorsOpen: string
  lastEntry: string
  endTime: string
  ageRestriction: number
  capacity: number
  status: FormStatus
  sendNotification: boolean
  notificationTitle: string
  notificationBody: string
}

type DrinksPkg = {
  id: string
  name: string
  description: string
  includes: string
  priceInPence: number
  isPopular: boolean
}

const MANSION_SATURDAYS_TEMPLATE: DrinksPkg[] = [
  { id: '', name: '5 Single Spirit Mixers', description: '5 single house spirit & mixers — save over £12 vs bar price.', includes: '5 x single house spirit\n5 x mixer of choice\nRedeemable at any bar', priceInPence: 2000, isPopular: false },
  { id: '', name: '5 Double Spirit Mixers', description: '5 double house spirit & mixers — save £20 vs bar price.', includes: '5 x double house spirit\n5 x mixer of choice\nRedeemable at any bar', priceInPence: 3500, isPopular: true },
  { id: '', name: '5 Beers Deal', description: '5 bottled beers — save £5 vs bar price.', includes: '5 x bottled beer\nRedeemable at any bar', priceInPence: 2500, isPopular: false },
]

const emptyForm: EventForm = {
  name: '',
  description: '',
  venue: 'Mansion, Liverpool',
  date: '',
  doorsOpen: '',
  lastEntry: '',
  endTime: '',
  ageRestriction: 18,
  capacity: 500,
  status: 'DRAFT',
  sendNotification: true,
  notificationTitle: '',
  notificationBody: '',
}

const emptyTierForm = {
  name: '',
  priceInPence: 0,
  allocation: 100,
}

interface ConfirmPublish {
  mode: 'create' | 'toggle'
  event?: AppEvent
}

export default function EventsPage() {
  const [events, setEvents] = useState<AppEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [showTierForm, setShowTierForm] = useState<string | null>(null)
  const [tierForm, setTierForm] = useState(emptyTierForm)
  const [showPastEvents, setShowPastEvents] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState<ConfirmPublish | null>(null)
  const [confirmUnpublish, setConfirmUnpublish] = useState<AppEvent | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AppEvent | null>(null)
  const [previewEvent, setPreviewEvent] = useState<AppEvent | null>(null)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [formTiers, setFormTiers] = useState<Array<{ id: string; name: string; priceInPence: number; allocation: number; sold: number }>>([])
  const [newTierRow, setNewTierRow] = useState(false)
  const [newTierData, setNewTierData] = useState({ name: '', priceInPence: 0, allocation: 100 })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Crop editor
  const [showCropEditor, setShowCropEditor] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropRawFile, setCropRawFile] = useState<File | null>(null)
  const [cropScale, setCropScale] = useState(1)
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  // Guest lists: eventId → entries
  const [guestLists, setGuestLists] = useState<Record<string, { id: string; name: string; email: string }[]>>({})
  const [guestForm, setGuestForm] = useState<Record<string, { name: string; email: string }>>({})
  const [addingGuest, setAddingGuest] = useState<string | null>(null)
  const guestUnsubs = useRef<Record<string, () => void>>({})
  const [dragging, setDragging] = useState(false)
  const [dragOrigin, setDragOrigin] = useState({ x: 0, y: 0 })
  const cropContainerRef = useRef<HTMLDivElement>(null)
  // Drinks packages
  const [formDrinksPackages, setFormDrinksPackages] = useState<DrinksPkg[]>([])
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null)
  // Publish scheduling
  const [publishMode, setPublishMode] = useState<'draft' | 'publishNow' | 'scheduled'>('draft')
  const [scheduledPublishAt, setScheduledPublishAt] = useState('')
  // Last entry toggle
  const [hasLastEntry, setHasLastEntry] = useState(true)

  const tsToLocal = (ts: { seconds: number } | undefined) => {
    if (!ts) return ''
    const d = new Date(ts.seconds * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const resetFormExtras = () => {
    setFormDrinksPackages([])
    setPublishMode('draft')
    setScheduledPublishAt('')
    setHasLastEntry(true)
    setIsDuplicating(false)
  }

  const startEdit = (event: AppEvent) => {
    setForm({
      name: event.name ?? '',
      description: event.description ?? '',
      venue: event.venue ?? 'Mansion, Liverpool',
      date: tsToLocal(event.date as { seconds: number }),
      doorsOpen: tsToLocal(event.doorsOpen as { seconds: number }),
      lastEntry: tsToLocal(event.lastEntry as { seconds: number }),
      endTime: tsToLocal(event.endTime as { seconds: number }),
      ageRestriction: event.ageRestriction ?? 18,
      capacity: event.capacity ?? 500,
      status: (['DRAFT', 'PUBLISHED'].includes(event.status) ? event.status : 'DRAFT') as FormStatus,
      sendNotification: false,
      notificationTitle: '',
      notificationBody: '',
    })
    setEditingEventId(event.id)
    setFormTiers((event.tiers ?? []).map(t => ({ id: t.id, name: t.name, priceInPence: t.priceInPence, allocation: t.allocation, sold: t.sold })))
    setNewTierRow(false)
    setImagePreview((event.headerImageURL as string) ?? null)
    setImageFile(null)
    // Drinks packages
    setFormDrinksPackages(((event as any).drinksPackages ?? []).map((p: any) => ({ ...p, includes: (p.includes ?? []).join('\n') })))
    // Publish scheduling
    const spa = (event as any).scheduledPublishAt
    if (spa) {
      setPublishMode('scheduled')
      setScheduledPublishAt(tsToLocal(spa))
    } else if (event.status === 'PUBLISHED') {
      setPublishMode('publishNow')
    } else {
      setPublishMode('draft')
    }
    setScheduledPublishAt(spa ? tsToLocal(spa) : '')
    // Last entry
    const hasLE = !!(event.lastEntry && event.date && (event.lastEntry as any).seconds !== (event.date as any).seconds)
    setHasLastEntry(hasLE)
    setIsDuplicating(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startDuplicate = (event: AppEvent) => {
    startEdit(event)
    setEditingEventId(null)
    setPublishMode('draft')
    setIsDuplicating(true)
  }

  const load = () => {
    getDocs(query(collection(db, 'events'), orderBy('date', 'desc')))
      .then(snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppEvent))))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCropRawFile(file)
    setCropSrc(URL.createObjectURL(file))
    setCropScale(1)
    setCropOffset({ x: 0, y: 0 })
    setShowCropEditor(true)
  }

  const confirmCrop = () => {
    if (!cropSrc || !cropRawFile || !cropContainerRef.current) return
    const container = cropContainerRef.current
    const W = container.offsetWidth
    const H = container.offsetHeight
    const canvas = document.createElement('canvas')
    canvas.width = W * 2
    canvas.height = H * 2
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.save()
      ctx.scale(2, 2)
      ctx.translate(W / 2 + cropOffset.x, H / 2 + cropOffset.y)
      ctx.scale(cropScale, cropScale)
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      ctx.restore()
      canvas.toBlob(blob => {
        if (!blob) return
        const croppedFile = new File([blob], cropRawFile.name, { type: 'image/jpeg' })
        setImageFile(croppedFile)
        setImagePreview(canvas.toDataURL('image/jpeg', 0.92))
        setShowCropEditor(false)
      }, 'image/jpeg', 0.92)
    }
    img.src = cropSrc
  }

  const uploadImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const ext = file.type === 'image/jpeg' ? '.jpg' : file.name.split('.').pop() || 'jpg'
      const safeName = `${Date.now()}.${ext}`
      const storageRef = ref(storage, `event-images/${safeName}`)
      const task = uploadBytesResumable(storageRef, file)
      const timeout = setTimeout(() => reject(new Error('Upload timed out after 30s — check Firebase Storage rules')), 30000)
      task.on('state_changed',
        snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        err => { clearTimeout(timeout); reject(err) },
        async () => { clearTimeout(timeout); resolve(await getDownloadURL(task.snapshot.ref)) }
      )
    })
  }

  const handleSaveEvent = async () => {
    if (!form.name || !form.date) return
    if (!editingEventId && publishMode === 'publishNow') {
      setConfirmPublish({ mode: 'create' })
      return
    }
    await doSaveEvent()
  }

  const doSaveEvent = async () => {
    setSaving(true)
    try {
      let headerImageURL: string | undefined
      if (imageFile) {
        headerImageURL = await uploadImage(imageFile)
        setUploadProgress(null)
      }
      const dateTs = Timestamp.fromDate(new Date(form.date))
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        venue: form.venue,
        date: dateTs,
        doorsOpen: form.doorsOpen ? Timestamp.fromDate(new Date(form.doorsOpen)) : dateTs,
        endTime: form.endTime ? Timestamp.fromDate(new Date(form.endTime)) : dateTs,
        ageRestriction: form.ageRestriction,
        capacity: form.capacity,
        artworkGradient: ['#1a0a00', '#2d1200'],
      }

      // Last entry
      if (hasLastEntry && form.lastEntry) {
        payload.lastEntry = Timestamp.fromDate(new Date(form.lastEntry))
      } else if (hasLastEntry) {
        payload.lastEntry = dateTs
      }

      // Publish mode
      if (publishMode === 'draft') {
        payload.status = 'DRAFT'
        payload.scheduledPublishAt = deleteField()
      } else if (publishMode === 'publishNow') {
        payload.status = 'PUBLISHED'
        payload.scheduledPublishAt = deleteField()
      } else if (publishMode === 'scheduled') {
        payload.status = 'DRAFT'
        if (scheduledPublishAt) {
          payload.scheduledPublishAt = Timestamp.fromDate(new Date(scheduledPublishAt))
        }
      }

      if (headerImageURL) payload.headerImageURL = headerImageURL

      payload.tiers = formTiers

      // Drinks packages
      payload.drinksPackages = formDrinksPackages.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        includes: p.includes.split('\n').filter((s: string) => s.trim()),
        priceInPence: p.priceInPence,
        isPopular: p.isPopular,
      }))

      if (editingEventId) {
        await updateDoc(doc(db, 'events', editingEventId), payload)
      } else {
        payload.headerImageURL = headerImageURL ?? ''
        await addDoc(collection(db, 'events'), payload)
        if (publishMode === 'publishNow' && form.sendNotification) {
          const title = form.notificationTitle || `New Event: ${form.name}`
          const body = form.notificationBody || `Tickets are now on sale for ${form.name}. Get yours before they sell out!`
          await sendPushNotification(title, body)
        }
      }

      setForm(emptyForm)
      setFormTiers([])
      setNewTierRow(false)
      setImageFile(null)
      setImagePreview(null)
      setEditingEventId(null)
      setShowForm(false)
      resetFormExtras()
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`Save failed: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (e: AppEvent) => {
    if (e.status === 'DRAFT') {
      setConfirmPublish({ mode: 'toggle', event: e })
    } else {
      setConfirmUnpublish(e)
    }
  }

  const sendPushNotification = async (title: string, body: string) => {
    try {
      await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${ONESIGNAL_REST_KEY}` },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          included_segments: ['Total Subscriptions'],
          headings: { en: title },
          contents: { en: body },
        }),
      })
    } catch {}
  }

  const doUnpublish = async () => {
    if (!confirmUnpublish) return
    await updateDoc(doc(db, 'events', confirmUnpublish.id), { status: 'DRAFT' })
    setConfirmUnpublish(null)
    load()
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    await deleteDoc(doc(db, 'events', confirmDelete.id))
    setConfirmDelete(null)
    load()
  }

  const confirmAndPublish = async () => {
    if (!confirmPublish) return
    if (confirmPublish.mode === 'create') {
      await doSaveEvent()
    } else if (confirmPublish.event) {
      await updateDoc(doc(db, 'events', confirmPublish.event.id), { status: 'PUBLISHED' })
      load()
    }
    setConfirmPublish(null)
  }

  const handleFormChange = (key: string, value: string | number | boolean) => {
    setForm(prev => {
      const updated: EventForm = { ...prev, [key]: value }
      if (key === 'name' && typeof value === 'string') {
        if (!prev.notificationTitle || prev.notificationTitle === `New Event: ${prev.name}`) {
          updated.notificationTitle = `New Event: ${value}`
        }
        if (!prev.notificationBody || prev.notificationBody.includes(prev.name)) {
          updated.notificationBody = `Tickets are now on sale for ${value}. Get yours before they sell out!`
        }
      }
      return updated
    })
  }

  const addTier = async (eventId: string, event: AppEvent) => {
    if (!tierForm.name) return
    const newTier = {
      id: crypto.randomUUID(),
      name: tierForm.name,
      priceInPence: Math.round(tierForm.priceInPence),
      allocation: tierForm.allocation,
      sold: 0,
      available: tierForm.allocation,
      description: '',
    }
    const updated = [...(event.tiers ?? []), newTier]
    await updateDoc(doc(db, 'events', eventId), { tiers: updated })
    setTierForm(emptyTierForm)
    setShowTierForm(null)
    load()
  }

  const deleteTier = async (event: AppEvent, tierId: string) => {
    const updated = (event.tiers ?? []).filter(t => t.id !== tierId)
    await updateDoc(doc(db, 'events', event.id), { tiers: updated })
    load()
  }

  const statusStyle = (s: string) => {
    if (s === 'PUBLISHED') return { bg: '#0a2010', color: '#16a34a', label: 'On Sale' }
    if (s === 'COMPLETED') return { bg: '#0a0a2e', color: '#818cf8', label: 'Completed' }
    if (s === 'CANCELLED') return { bg: '#2e0f0f', color: '#dc2626', label: 'Cancelled' }
    return { bg: '#1a1400', color: '#111111', label: 'Draft' }
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingEventId(null)
    setForm(emptyForm)
    setFormTiers([])
    setNewTierRow(false)
    setImageFile(null)
    setImagePreview(null)
    resetFormExtras()
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>

      {/* Crop Editor Modal */}
      {showCropEditor && cropSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ width: 640, background: '#ffffff', border: '1px solid #e5e5ea' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f2' }}>
              <div>
                <div className="text-sm font-semibold text-gray-900">Adjust Image</div>
                <div className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>Drag to reposition · Scroll to zoom</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { setCropScale(s => Math.max(0.2, +(s - 0.1).toFixed(1))) }}
                  className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold"
                  style={{ background: '#f0f0f2', color: '#aeaeb2' }}>−</button>
                <span className="text-xs w-10 text-center" style={{ color: '#6e6e73' }}>{Math.round(cropScale * 100)}%</span>
                <button onClick={() => { setCropScale(s => Math.min(5, +(s + 0.1).toFixed(1))) }}
                  className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold"
                  style={{ background: '#f0f0f2', color: '#aeaeb2' }}>+</button>
              </div>
            </div>
            {/* Canvas area */}
            <div
              ref={cropContainerRef}
              className="relative overflow-hidden cursor-grab select-none"
              style={{ height: 300, background: '#000' }}
              onMouseDown={e => { setDragging(true); setDragOrigin({ x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y }) }}
              onMouseMove={e => { if (!dragging) return; setCropOffset({ x: e.clientX - dragOrigin.x, y: e.clientY - dragOrigin.y }) }}
              onMouseUp={() => setDragging(false)}
              onMouseLeave={() => setDragging(false)}
              onWheel={e => { e.preventDefault(); setCropScale(s => Math.min(5, Math.max(0.2, +(s - e.deltaY * 0.001).toFixed(3)))) }}
            >
              <img
                src={cropSrc}
                alt="crop"
                draggable={false}
                style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale})`,
                  maxWidth: 'none',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
              {/* Grid overlay */}
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
                backgroundSize: '33.33% 33.33%',
              }} />
            </div>
            <div className="px-5 py-4 flex justify-between items-center" style={{ borderTop: '1px solid #e5e5ea' }}>
              <button onClick={() => { setCropScale(1); setCropOffset({ x: 0, y: 0 }) }}
                className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#f0f0f2', color: '#6e6e73' }}>
                Reset
              </button>
              <div className="flex gap-3">
                <button onClick={() => setShowCropEditor(false)}
                  className="text-xs px-4 py-2 rounded-lg" style={{ background: '#f0f0f2', color: '#aeaeb2' }}>
                  Cancel
                </button>
                <button onClick={confirmCrop}
                  className="text-xs px-4 py-2 rounded-lg font-semibold" style={{ background: '#111111', color: '#fff' }}>
                  Use Image
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <div>
          <h1 className="text-base font-bold text-gray-900">Events</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>{events.length} event{events.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-xs font-semibold"
          style={{ background: '#111111', color: '#fff' }}>
          + New Event
        </button>
      </div>

      <div className="p-8 space-y-4">
        {/* Create/Edit form */}
        {showForm && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
            <div className="px-6 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
              <span className="text-xs font-semibold text-gray-900">
                {isDuplicating ? 'Duplicate Event' : editingEventId ? 'Edit Event' : 'New Event'}
              </span>
              <button onClick={closeForm} className="text-xs" style={{ color: '#6e6e73' }}>✕</button>
            </div>
            <div className="p-6" style={{ background: '#f5f5f7' }}>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Event Name', key: 'name', type: 'text' },
                  { label: 'Venue', key: 'venue', type: 'text' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>{f.label}</label>
                    <input
                      type={f.type}
                      value={(form as unknown as Record<string, string | number>)[f.key]}
                      onChange={e => handleFormChange(f.key, e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                      style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                    />
                  </div>
                ))}
                {[
                  { label: 'Date & Time', key: 'date' },
                  { label: 'Doors Open', key: 'doorsOpen' },
                  { label: 'End Time', key: 'endTime' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>{f.label}</label>
                    <input
                      type="datetime-local"
                      value={(form as unknown as Record<string, string>)[f.key]}
                      onChange={e => handleFormChange(f.key, e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                      style={{ background: '#ffffff', border: '1px solid #e5e5ea', colorScheme: 'dark' }}
                    />
                  </div>
                ))}

                {/* Last Entry with toggle */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] uppercase tracking-widest" style={{ color: '#6e6e73' }}>Last Entry</label>
                    <button type="button"
                      onClick={() => setHasLastEntry(v => !v)}
                      className="w-8 h-4 rounded-full transition-all relative flex-shrink-0"
                      style={{ background: hasLastEntry ? '#111111' : '#e5e5ea' }}>
                      <div className="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all"
                        style={{ left: hasLastEntry ? 17 : 2 }} />
                    </button>
                  </div>
                  {hasLastEntry && (
                    <input
                      type="datetime-local"
                      value={form.lastEntry}
                      onChange={e => handleFormChange('lastEntry', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                      style={{ background: '#ffffff', border: '1px solid #e5e5ea', colorScheme: 'dark' }}
                    />
                  )}
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none resize-none"
                    style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                  />
                </div>

                {/* Header image */}
                <div className="col-span-2">
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Header Image (shown in app)</label>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  {imagePreview ? (
                    <div className="relative rounded-xl overflow-hidden" style={{ height: 160 }}>
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-end justify-between p-3" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }}>
                        <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                          className="text-[10px] px-2 py-1 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>
                          Remove
                        </button>
                        {cropSrc && (
                          <button type="button" onClick={() => setShowCropEditor(true)}
                            className="text-[10px] px-2 py-1 rounded" style={{ background: '#fef9ee', color: '#111111' }}>
                            Reposition
                          </button>
                        )}
                      </div>
                      {uploadProgress !== null && (
                        <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: '#f0f0f2' }}>
                          <div className="h-full transition-all" style={{ background: '#111111', width: `${uploadProgress}%` }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-xl flex flex-col items-center justify-center gap-2 transition-colors"
                      style={{ height: 120, border: '2px dashed #2a2a2a', background: '#ffffff' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#C9A84C')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a2a2a')}>
                      <span className="text-xl">🖼</span>
                      <span className="text-[11px]" style={{ color: '#6e6e73' }}>Click to upload image</span>
                      <span className="text-[10px]" style={{ color: '#6e6e73' }}>JPG, PNG, WEBP — recommended 1200×600px</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Ticket Tiers */}
              <div className="mt-4 rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
                  <span className="text-xs font-semibold text-gray-900">Ticket Types</span>
                  {!newTierRow && (
                    <button type="button" onClick={() => setNewTierRow(true)}
                      className="text-[11px] font-semibold px-3 py-1 rounded-lg"
                      style={{ background: '#fef9ee', color: '#111111', border: '1px solid #3a2a00' }}>
                      + Add Tier
                    </button>
                  )}
                </div>
                {formTiers.length > 0 && (
                  <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0f0f2' }}>
                        {['Name', 'Price', 'Allocation', ''].map(h => (
                          <th key={h} className="text-left px-4 py-2 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {formTiers.map((t, i) => (
                        <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f2' }}>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{t.name}</td>
                          <td className="px-4 py-2.5" style={{ color: '#111111' }}>{fmt(t.priceInPence)}</td>
                          <td className="px-4 py-2.5" style={{ color: '#6e6e73' }}>{t.allocation}</td>
                          <td className="px-4 py-2.5">
                            <button type="button" onClick={() => setFormTiers(prev => prev.filter((_, j) => j !== i))}
                              className="text-[10px]" style={{ color: '#6e6e73' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                              onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {newTierRow && (
                  <div className="px-4 py-3 flex items-end gap-3 flex-wrap" style={{ background: '#f5f5f7', borderTop: formTiers.length > 0 ? '1px solid #e5e5ea' : 'none' }}>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Name</label>
                      <input type="text" placeholder="e.g. Early Bird" value={newTierData.name}
                        onChange={e => setNewTierData(p => ({ ...p, name: e.target.value }))}
                        className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none w-40"
                        style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Price (£)</label>
                      <input type="number" placeholder="10.00" step="0.01" min="0"
                        value={newTierData.priceInPence / 100 || ''}
                        onChange={e => setNewTierData(p => ({ ...p, priceInPence: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                        className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none w-28"
                        style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Allocation</label>
                      <input type="number" placeholder="100" min="1"
                        value={newTierData.allocation || ''}
                        onChange={e => setNewTierData(p => ({ ...p, allocation: parseInt(e.target.value || '0') }))}
                        className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none w-24"
                        style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                    </div>
                    <button type="button"
                      onClick={() => {
                        if (!newTierData.name) return
                        setFormTiers(prev => [...prev, { id: crypto.randomUUID(), sold: 0, ...newTierData }])
                        setNewTierData({ name: '', priceInPence: 0, allocation: 100 })
                        setNewTierRow(false)
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-semibold"
                      style={{ background: '#111111', color: '#fff' }}>
                      Add
                    </button>
                    <button type="button" onClick={() => { setNewTierRow(false); setNewTierData({ name: '', priceInPence: 0, allocation: 100 }) }}
                      className="px-3 py-2 rounded-lg text-xs"
                      style={{ background: '#f0f0f2', color: '#6e6e73' }}>
                      Cancel
                    </button>
                  </div>
                )}
                {formTiers.length === 0 && !newTierRow && (
                  <div className="px-4 py-4 text-[11px] text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>
                    No ticket types yet — click + Add Tier above
                  </div>
                )}
              </div>

              {/* Drinks Packages */}
              <div className="mt-4 rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
                  <span className="text-xs font-semibold text-gray-900">Drinks Packages</span>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setFormDrinksPackages(MANSION_SATURDAYS_TEMPLATE.map(p => ({ ...p, id: crypto.randomUUID() })))}
                      className="text-[11px] font-semibold px-3 py-1 rounded-lg"
                      style={{ background: '#f0f0f2', color: '#818cf8', border: '1px solid #e5e5ea' }}>
                      Use Mansion Saturdays Template
                    </button>
                    <button type="button"
                      onClick={() => {
                        const id = crypto.randomUUID()
                        setFormDrinksPackages(prev => [...prev, { id, name: '', description: '', includes: '', priceInPence: 0, isPopular: false }])
                        setExpandedPkg(id)
                      }}
                      className="text-[11px] font-semibold px-3 py-1 rounded-lg"
                      style={{ background: '#fef9ee', color: '#111111', border: '1px solid #3a2a00' }}>
                      + Add Package
                    </button>
                  </div>
                </div>
                {formDrinksPackages.length === 0 ? (
                  <div className="px-4 py-4 text-[11px] text-center" style={{ color: '#6e6e73', background: '#f5f5f7' }}>
                    No drinks packages yet
                  </div>
                ) : (
                  <div style={{ background: '#f5f5f7' }}>
                    {formDrinksPackages.map((pkg, i) => (
                      <div key={pkg.id} style={{ borderBottom: '1px solid #e5e5ea' }}>
                        <div className="px-4 py-3 flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedPkg(expandedPkg === pkg.id ? null : pkg.id)}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-900 font-medium">{pkg.name || 'Untitled Package'}</span>
                            {pkg.isPopular && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider" style={{ background: '#fef9ee', color: '#111111' }}>Popular</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {pkg.priceInPence > 0 && <span className="text-xs" style={{ color: '#111111' }}>{fmt(pkg.priceInPence)}</span>}
                            <button type="button"
                              onClick={e => { e.stopPropagation(); setFormDrinksPackages(prev => prev.filter((_, j) => j !== i)) }}
                              className="text-[10px]" style={{ color: '#6e6e73' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
                              onMouseLeave={e => (e.currentTarget.style.color = '#6e6e73')}>
                              Remove
                            </button>
                            <span className="text-xs" style={{ color: '#6e6e73' }}>{expandedPkg === pkg.id ? '▾' : '▸'}</span>
                          </div>
                        </div>
                        {expandedPkg === pkg.id && (
                          <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid #e5e5ea', background: '#ffffff' }}>
                            <div className="grid grid-cols-2 gap-3 pt-3">
                              <div>
                                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Name</label>
                                <input type="text" value={pkg.name}
                                  onChange={e => setFormDrinksPackages(prev => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                                  style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Price (£)</label>
                                <input type="number" step="0.01" min="0" value={pkg.priceInPence / 100 || ''}
                                  onChange={e => setFormDrinksPackages(prev => prev.map((p, j) => j === i ? { ...p, priceInPence: Math.round(parseFloat(e.target.value || '0') * 100) } : p))}
                                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                                  style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Description</label>
                              <input type="text" value={pkg.description}
                                onChange={e => setFormDrinksPackages(prev => prev.map((p, j) => j === i ? { ...p, description: e.target.value } : p))}
                                className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                                style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Includes (one item per line)</label>
                              <textarea rows={3} value={pkg.includes}
                                onChange={e => setFormDrinksPackages(prev => prev.map((p, j) => j === i ? { ...p, includes: e.target.value } : p))}
                                className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none resize-none"
                                style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] uppercase tracking-wider" style={{ color: '#6e6e73' }}>Popular</span>
                              <button type="button"
                                onClick={() => setFormDrinksPackages(prev => prev.map((p, j) => j === i ? { ...p, isPopular: !p.isPopular } : p))}
                                className="w-8 h-4 rounded-full transition-all relative flex-shrink-0"
                                style={{ background: pkg.isPopular ? '#111111' : '#e5e5ea' }}>
                                <div className="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all"
                                  style={{ left: pkg.isPopular ? 17 : 2 }} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Push notification — only shown for publishNow */}
              {publishMode === 'publishNow' && <div className="mt-4 rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: form.sendNotification ? '1px solid #e5e5ea' : 'none' }}>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">Push Notification</div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>Send to all users when published</div>
                  </div>
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, sendNotification: !p.sendNotification }))}
                    className="w-10 h-6 rounded-full transition-all relative flex-shrink-0"
                    style={{ background: form.sendNotification ? '#111111' : '#e5e5ea' }}>
                    <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
                      style={{ left: form.sendNotification ? 22 : 4 }} />
                  </button>
                </div>
                {form.sendNotification && (
                  <div className="p-4 flex flex-col gap-3" style={{ background: '#f5f5f7' }}>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Notification Title</label>
                      <input type="text" maxLength={64}
                        value={form.notificationTitle}
                        onChange={e => setForm(p => ({ ...p, notificationTitle: e.target.value }))}
                        className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                        style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Message</label>
                      <textarea maxLength={180} rows={2}
                        value={form.notificationBody}
                        onChange={e => setForm(p => ({ ...p, notificationBody: e.target.value }))}
                        className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none resize-none"
                        style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                    </div>
                    {(form.notificationTitle || form.notificationBody) && (
                      <div className="flex items-start gap-3 px-3 py-3 rounded-xl" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#111111' }}>
                          <span className="text-[10px] font-black text-white">M</span>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-900">{form.notificationTitle || 'Title'}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>{form.notificationBody || 'Message'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>}

              {/* Publish mode */}
              <div className="mt-4 mb-1">
                <label className="text-[10px] uppercase tracking-widest block mb-2" style={{ color: '#6e6e73' }}>Visibility</label>
                <div className="flex gap-2 flex-wrap">
                  <button type="button"
                    onClick={() => setPublishMode('draft')}
                    className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: publishMode === 'draft' ? '#111111' : '#f0f0f2',
                      color: publishMode === 'draft' ? '#ffffff' : '#6e6e73',
                      border: `1px solid ${publishMode === 'draft' ? '#111111' : '#e5e5ea'}`,
                    }}>
                    📝 Save as Draft
                  </button>
                  <button type="button"
                    onClick={() => setPublishMode('publishNow')}
                    className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: publishMode === 'publishNow' ? '#f0fdf4' : '#f0f0f2',
                      color: publishMode === 'publishNow' ? '#16a34a' : '#6e6e73',
                      border: `1px solid ${publishMode === 'publishNow' ? '#bbf7d0' : '#e5e5ea'}`,
                    }}>
                    ⚡ Publish Now
                  </button>
                  <button type="button"
                    onClick={() => setPublishMode('scheduled')}
                    className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: publishMode === 'scheduled' ? '#f0f0ff' : '#f0f0f2',
                      color: publishMode === 'scheduled' ? '#818cf8' : '#6e6e73',
                      border: `1px solid ${publishMode === 'scheduled' ? '#c7d2fe' : '#e5e5ea'}`,
                    }}>
                    🕐 Schedule
                  </button>
                </div>
                {publishMode === 'scheduled' && (
                  <div className="mt-2">
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Publish At</label>
                    <input
                      type="datetime-local"
                      value={scheduledPublishAt}
                      onChange={e => setScheduledPublishAt(e.target.value)}
                      className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                      style={{ background: '#ffffff', border: '1px solid #e5e5ea', colorScheme: 'dark' }}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={handleSaveEvent} disabled={saving}
                  className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: '#111111', color: '#fff' }}>
                  {saving ? 'Saving…' : editingEventId ? 'Save Changes' : publishMode === 'publishNow' ? 'Publish Event' : publishMode === 'scheduled' ? 'Schedule Event' : 'Save Draft'}
                </button>
                <button onClick={closeForm}
                  className="px-4 py-2 rounded-lg text-xs"
                  style={{ background: '#f0f0f2', color: '#6e6e73' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-xs" style={{ color: '#6e6e73' }}>Loading…</div>
        ) : events.length === 0 ? (
          <div className="rounded-xl p-16 text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
            <div className="text-xs" style={{ color: '#6e6e73' }}>No events yet — create one to get started</div>
          </div>
        ) : (() => {
          const now = Date.now()
          const upcoming = events.filter(e => !e.date || e.date.seconds * 1000 >= now)
          const past = events.filter(e => e.date && e.date.seconds * 1000 < now)
          const renderEvent = (event: AppEvent) => {
          const ss = statusStyle(event.status)
          const date = event.date ? new Date(event.date.seconds * 1000) : null
          const totalSold = event.tiers?.reduce((s, t) => s + t.sold, 0) ?? 0
          const totalRevenue = event.tiers?.reduce((s, t) => s + t.priceInPence * t.sold, 0) ?? 0
          const isExpanded = expandedEvent === event.id

          return (
            <div key={event.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
              {/* Event header row */}
              <div className="px-6 py-4 flex items-center gap-4 cursor-pointer"
                style={{ background: '#ffffff' }}
                onClick={() => {
                  const next = isExpanded ? null : event.id
                  setExpandedEvent(next)
                  if (next && !guestUnsubs.current[next]) {
                    const unsub = onSnapshot(
                      collection(db, 'events', next, 'guestList'),
                      snap => setGuestLists(prev => ({
                        ...prev,
                        [next]: snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; name: string; email: string }))
                      }))
                    )
                    guestUnsubs.current[next] = unsub
                  }
                }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-sm text-gray-900 truncate">{event.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
                      style={{ background: ss.bg, color: ss.color }}>
                      {ss.label}
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: '#6e6e73' }}>
                    {date ? date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    {' · '}{event.venue}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right flex-shrink-0">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#6e6e73' }}>Sold</div>
                    <div className="text-sm font-semibold text-gray-900">{totalSold}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#6e6e73' }}>Revenue</div>
                    <div className="text-sm font-semibold" style={{ color: '#111111' }}>{fmt(totalRevenue)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {event.status === 'DRAFT' && (
                      <button
                        onClick={e => { e.stopPropagation(); setPreviewEvent(event) }}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                        style={{ background: '#f0f0f2', color: '#111111', border: '1px solid #e5e5ea' }}>
                        Preview
                      </button>
                    )}
                    {event.status === 'PUBLISHED' && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(`${EVENT_PAGES_BASE}/mansion/${event.id}`)
                            .then(() => alert('Link copied!'))
                        }}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                        style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                        Copy link
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); startEdit(event) }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                      style={{ background: '#f0f0f2', color: '#111111', border: '1px solid #e5e5ea' }}>
                      Edit
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); startDuplicate(event) }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                      style={{ background: '#0a0a1a', color: '#818cf8', border: '1px solid #1a1a3a' }}>
                      Duplicate
                    </button>
                    {(event.status === 'DRAFT' || event.status === 'PUBLISHED') && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleStatus(event) }}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                        style={{ background: event.status === 'PUBLISHED' ? '#fff7ed' : '#f0fdf4', color: event.status === 'PUBLISHED' ? '#ea580c' : '#16a34a', border: `1px solid ${event.status === 'PUBLISHED' ? '#fed7aa' : '#bbf7d0'}` }}>
                        {event.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(event) }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                      style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                      Delete
                    </button>
                    <span className="text-xs" style={{ color: '#6e6e73' }}>{isExpanded ? '▾' : '▸'}</span>
                  </div>
                </div>
              </div>

              {/* Ticket tiers table */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #e5e5ea' }} onClick={e => e.stopPropagation()}>
                  <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0f0f2' }}>
                        {['Ticket Type', 'Status', 'Allocation', 'Price', 'Sold', 'Revenue', ''].map(h => (
                          <th key={h} className="text-left px-5 py-2.5 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(event.tiers ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-5 py-4 text-center" style={{ color: '#6e6e73' }}>No ticket types — add one below</td>
                        </tr>
                      ) : (event.tiers ?? []).map(tier => {
                        const pct = tier.allocation > 0 ? Math.round((tier.sold / tier.allocation) * 100) : 0
                        const soldOut = tier.sold >= tier.allocation
                        return (
                          <tr key={tier.id} className="transition-colors" style={{ borderBottom: '1px solid #f0f0f2' }}>
                            <td className="px-5 py-3 font-medium text-gray-900">{tier.name}</td>
                            <td className="px-5 py-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                                style={{ background: soldOut ? '#2e0f0f' : '#0a2010', color: soldOut ? '#f87171' : '#4ade80' }}>
                                {soldOut ? 'Sold Out' : 'On Sale'}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f0f0f2', width: 64 }}>
                                  <div className="h-full rounded-full transition-all" style={{ background: pct >= 90 ? '#f87171' : '#C9A84C', width: `${pct}%` }} />
                                </div>
                                <span style={{ color: '#6e6e73' }}>{tier.sold}/{tier.allocation}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 font-medium text-gray-900">{fmt(tier.priceInPence)}</td>
                            <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{tier.sold}</td>
                            <td className="px-5 py-3 font-medium" style={{ color: '#111111' }}>{fmt(tier.priceInPence * tier.sold)}</td>
                            <td className="px-5 py-3">
                              <button onClick={() => deleteTier(event, tier.id)}
                                className="text-[10px] transition-colors" style={{ color: '#6e6e73' }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#3a3a3a')}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Add tier form */}
                  {showTierForm === event.id ? (
                    <div className="px-5 py-4 flex items-end gap-3" style={{ borderTop: '1px solid #e5e5ea', background: '#f5f5f7' }}>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Name</label>
                        <input type="text" placeholder="e.g. Early Bird"
                          value={tierForm.name}
                          onChange={e => setTierForm(p => ({ ...p, name: e.target.value }))}
                          className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none w-40"
                          style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Price (£)</label>
                        <input type="number" placeholder="10.00" step="0.01" min="0"
                          value={tierForm.priceInPence / 100 || ''}
                          onChange={e => setTierForm(p => ({ ...p, priceInPence: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                          className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none w-28"
                          style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Allocation</label>
                        <input type="number" placeholder="100" min="1"
                          value={tierForm.allocation || ''}
                          onChange={e => setTierForm(p => ({ ...p, allocation: parseInt(e.target.value || '0') }))}
                          className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none w-24"
                          style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                      </div>
                      <button onClick={() => addTier(event.id, event)}
                        className="px-4 py-2 rounded-lg text-xs font-semibold"
                        style={{ background: '#111111', color: '#fff' }}>
                        Add Ticket Type
                      </button>
                      <button onClick={() => { setShowTierForm(null); setTierForm(emptyTierForm) }}
                        className="px-3 py-2 rounded-lg text-xs"
                        style={{ background: '#f0f0f2', color: '#6e6e73' }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="px-5 py-3" style={{ borderTop: '1px solid #e5e5ea', background: '#f5f5f7' }}>
                      <button onClick={e => { e.stopPropagation(); setShowTierForm(event.id); setTierForm(emptyTierForm) }}
                        className="text-xs font-medium transition-colors"
                        style={{ color: '#111111' }}>
                        + Add Ticket Type
                      </button>
                    </div>
                  )}

                  {/* Guest list section */}
                  {(() => {
                    const guests = guestLists[event.id] ?? []
                    const gf = guestForm[event.id] ?? { name: '', email: '' }
                    return (
                      <div style={{ borderTop: '1px solid #e5e5ea', background: '#ffffff' }}>
                        {/* Header */}
                        <div className="px-5 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6e6e73' }}>Guest List</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#f0f0f2', color: '#111111' }}>
                              {guests.length} {guests.length === 1 ? 'guest' : 'guests'}
                            </span>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); setAddingGuest(addingGuest === event.id ? null : event.id) }}
                            className="text-xs font-medium"
                            style={{ color: '#111111' }}>
                            {addingGuest === event.id ? 'Cancel' : '+ Add Guest'}
                          </button>
                        </div>

                        {/* Add guest form */}
                        {addingGuest === event.id && (
                          <div className="px-5 pb-4 flex items-end gap-3" style={{ borderTop: '1px solid #f0f0f2' }}>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Name</label>
                              <input
                                type="text" placeholder="Full name"
                                value={gf.name}
                                onChange={e => setGuestForm(prev => ({ ...prev, [event.id]: { ...gf, name: e.target.value } }))}
                                className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none w-44"
                                style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#6e6e73' }}>Email</label>
                              <input
                                type="email" placeholder="email@example.com"
                                value={gf.email}
                                onChange={e => setGuestForm(prev => ({ ...prev, [event.id]: { ...gf, email: e.target.value } }))}
                                className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none w-52"
                                style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }}
                              />
                            </div>
                            <button
                              onClick={async e => {
                                e.stopPropagation()
                                if (!gf.name.trim()) return
                                await addDoc(collection(db, 'events', event.id, 'guestList'), {
                                  name: gf.name.trim(),
                                  email: gf.email.trim(),
                                  addedAt: Timestamp.now(),
                                })
                                setGuestForm(prev => ({ ...prev, [event.id]: { name: '', email: '' } }))
                                setAddingGuest(null)
                              }}
                              className="px-4 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: '#111111', color: '#fff' }}>
                              Add
                            </button>
                          </div>
                        )}

                        {/* Guest rows */}
                        {guests.length > 0 && (
                          <table className="w-full text-xs" style={{ background: '#f5f5f7' }}>
                            <thead>
                              <tr style={{ borderTop: '1px solid #f0f0f2', borderBottom: '1px solid #f0f0f2' }}>
                                <th className="text-left px-5 py-2 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>Name</th>
                                <th className="text-left px-5 py-2 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>Email</th>
                                <th className="px-5 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {guests.map(guest => (
                                <tr key={guest.id} style={{ borderBottom: '1px solid #f0f0f2' }}>
                                  <td className="px-5 py-2.5 font-medium text-gray-900">{guest.name}</td>
                                  <td className="px-5 py-2.5" style={{ color: '#6e6e73' }}>{guest.email}</td>
                                  <td className="px-5 py-2.5 text-right">
                                    <button
                                      onClick={async e => {
                                        e.stopPropagation()
                                        await deleteDoc(doc(db, 'events', event.id, 'guestList', guest.id))
                                      }}
                                      className="text-[10px] transition-colors" style={{ color: '#6e6e73' }}
                                      onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
                                      onMouseLeave={e => (e.currentTarget.style.color = '#6e6e73')}>
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
          }

          return (
            <>
              {upcoming.length === 0 && past.length > 0 ? null : upcoming.length === 0 ? (
                <div className="rounded-xl p-16 text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                  <div className="text-xs" style={{ color: '#6e6e73' }}>No upcoming events — create one to get started</div>
                </div>
              ) : upcoming.map(renderEvent)}

              {past.length > 0 && (
                <div className="mt-6">
                  <button
                    onClick={() => setShowPastEvents(v => !v)}
                    className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: '#6e6e73' }}>
                    <span style={{ transform: showPastEvents ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
                    Previous Events ({past.length})
                  </button>
                  {showPastEvents && (
                    <div className="flex flex-col gap-3 opacity-60">
                      {past.map(renderEvent)}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* App Preview modal */}
      {previewEvent && (() => {
        const e = previewEvent
        const date = e.date ? new Date(e.date.seconds * 1000) : null
        const dateStr = date ? date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'
        const timeStr = date ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'
        const lowestTier = (e.tiers ?? []).filter(t => t.priceInPence > 0).sort((a, b) => a.priceInPence - b.priceInPence)[0]
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}
            onClick={() => setPreviewEvent(null)}>
            <div onClick={e => e.stopPropagation()} className="flex flex-col" style={{ width: 375, maxHeight: '90vh' }}>
              {/* Phone frame */}
              <div className="rounded-3xl overflow-hidden flex flex-col" style={{ background: '#f5f5f7', border: '8px solid #1a1a1a', boxShadow: '0 40px 80px rgba(0,0,0,0.3)', maxHeight: '90vh' }}>
                {/* Status bar */}
                <div className="flex items-center justify-between px-6 pt-3 pb-1 flex-shrink-0" style={{ background: '#f5f5f7' }}>
                  <span className="text-[11px] font-semibold text-gray-900">9:41</span>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-2 rounded-sm border border-white opacity-60" style={{ background: 'white' }} />
                  </div>
                </div>

                <div className="overflow-y-auto flex-1">
                  {/* Header image */}
                  <div className="relative" style={{ height: 240 }}>
                    {e.headerImageURL ? (
                      <img src={e.headerImageURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${(e.artworkGradient ?? ['#1a0a00', '#2d1200'])[0]}, ${(e.artworkGradient ?? ['#1a0a00', '#2d1200'])[1]})` }} />
                    )}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #0a0a0a 0%, transparent 50%)' }} />
                    {lowestTier && (
                      <div className="absolute bottom-3 left-4 px-3 py-1 rounded-full text-[11px] font-bold" style={{ background: '#111111', color: '#fff' }}>
                        FROM £{(lowestTier.priceInPence / 100).toFixed(2)}
                      </div>
                    )}
                  </div>

                  {/* Event info */}
                  <div className="px-4 pb-4" style={{ background: '#f5f5f7' }}>
                    <h1 className="text-xl font-black tracking-widest uppercase text-gray-900 mt-2 mb-1">{e.name}</h1>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-[11px]" style={{ color: '#6e6e73' }}>📅 {dateStr}</span>
                      <span className="text-[11px]" style={{ color: '#6e6e73' }}>🕙 {timeStr}</span>
                    </div>
                    <p className="text-[11px] mb-4 leading-relaxed" style={{ color: '#6e6e73' }}>{e.description || 'No description set.'}</p>

                    {(e.tiers ?? []).length > 0 && (
                      <div className="flex flex-col gap-2 mb-4">
                        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#6e6e73' }}>Tickets</div>
                        {(e.tiers ?? []).map(t => (
                          <div key={t.id} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                            <div>
                              <div className="text-xs font-semibold text-gray-900">{t.name}</div>
                              <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>{t.allocation - t.sold} remaining</div>
                            </div>
                            <div className="text-sm font-bold" style={{ color: '#111111' }}>
                              {t.priceInPence === 0 ? 'Free' : `£${(t.priceInPence / 100).toFixed(2)}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl py-3.5 text-center text-sm font-bold tracking-wide" style={{ background: '#111111', color: '#fff' }}>
                      Get Tickets
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center mt-4 flex items-center justify-center gap-3">
                <span className="text-xs" style={{ color: '#6e6e73' }}>App Preview — Draft</span>
                <button onClick={() => setPreviewEvent(null)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: '#f0f0f2', color: '#6e6e73' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="rounded-2xl p-8 w-full max-w-sm text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#fee2e2' }}>
              <span className="text-xl">🗑</span>
            </div>
            <h2 className="text-sm font-bold text-gray-900 mb-2">Delete this event?</h2>
            <p className="text-xs leading-relaxed mb-1" style={{ color: '#6e6e73' }}>
              "{confirmDelete.name}" will be permanently deleted.
            </p>
            <p className="text-xs leading-relaxed mb-6" style={{ color: '#dc2626' }}>
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-lg text-xs font-medium"
                style={{ background: '#f0f0f2', color: '#6e6e73', border: '1px solid #e5e5ea' }}>
                Cancel
              </button>
              <button onClick={doDelete}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unpublish confirmation modal */}
      {confirmUnpublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="rounded-2xl p-8 w-full max-w-sm text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#fee2e2' }}>
              <span className="text-xl">⚠️</span>
            </div>
            <h2 className="text-sm font-bold text-gray-900 mb-2">Unpublish this event?</h2>
            <p className="text-xs leading-relaxed mb-6" style={{ color: '#6e6e73' }}>
              "{confirmUnpublish.name}" will be removed from the app immediately. Existing ticket holders keep their tickets.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmUnpublish(null)}
                className="flex-1 py-2.5 rounded-lg text-xs font-medium"
                style={{ background: '#f0f0f2', color: '#6e6e73', border: '1px solid #e5e5ea' }}>
                Cancel
              </button>
              <button onClick={doUnpublish}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                Yes, Unpublish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish confirmation modal */}
      {confirmPublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="rounded-2xl p-8 w-full max-w-sm text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#fef9ee' }}>
              <span className="text-xl">⚡</span>
            </div>
            <h2 className="text-sm font-bold text-gray-900 mb-2">Make this event live?</h2>
            <p className="text-xs leading-relaxed mb-6" style={{ color: '#6e6e73' }}>
              {confirmPublish.mode === 'create'
                ? `"${form.name}" will be published and immediately visible to all users in the app.`
                : `"${confirmPublish.event?.name}" will go live and immediately visible to all users in the app.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmPublish(null)}
                className="flex-1 py-2.5 rounded-lg text-xs font-medium"
                style={{ background: '#f0f0f2', color: '#6e6e73', border: '1px solid #e5e5ea' }}>
                Cancel
              </button>
              <button onClick={confirmAndPublish} disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: '#111111', color: '#fff' }}>
                {saving ? 'Publishing…' : 'Yes, Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
