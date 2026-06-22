'use client'

import { useEffect, useRef, useState } from 'react'
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, Timestamp, where
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'

// ─── Types ────────────────────────────────────────────────────────────────────

type FontFamily = 'sans-serif' | 'serif' | 'display'

interface SignUpLink {
  id: string
  slug: string
  title: string
  description: string
  mainImageURL?: string
  backgroundImageURL?: string
  backgroundColorHex: string
  textColorHex: string
  fontFamily: FontFamily
  appStoreURL: string
  active: boolean
  createdAt: Timestamp
  submissionCount: number
  scheduledStartAt?: Timestamp
  scheduledEndAt?: Timestamp
}

interface Submission {
  id: string
  linkId: string
  linkTitle: string
  userId: string
  userName: string
  userEmail: string
  userPhone?: string
  instagramUsername?: string
  submittedAt: Timestamp
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PUBLIC_BASE = 'https://mansion-nightclub-liverpool.web.app'

function slugify(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

function fmtDate(ts: Timestamp | undefined) {
  if (!ts) return '—'
  return new Date(ts.seconds * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtDateTime(ts: Timestamp | undefined) {
  if (!ts) return '—'
  const d = new Date(ts.seconds * 1000)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = {
  title: '',
  description: '',
  slug: '',
  mainImageURL: '',
  backgroundImageURL: '',
  backgroundColorHex: '#0a0a0a',
  textColorHex: '#ffffff',
  fontFamily: 'sans-serif' as FontFamily,
  appStoreURL: 'https://apps.apple.com/gb/app/mansion-liverpool/id6742553975',
  active: true,
  scheduledStartAt: '',
  scheduledEndAt: '',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignUpsPage() {
  const [tab, setTab] = useState<'links' | 'submissions'>('links')

  // Links
  const [links, setLinks] = useState<SignUpLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(true)

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [slugManual, setSlugManual] = useState(false)
  const [saving, setSaving] = useState(false)

  // Image uploads
  const [mainImageFile, setMainImageFile] = useState<File | null>(null)
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null)
  const [bgImageFile, setBgImageFile] = useState<File | null>(null)
  const [bgImagePreview, setBgImagePreview] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const mainImageRef = useRef<HTMLInputElement>(null)
  const bgImageRef = useRef<HTMLInputElement>(null)

  // Submissions
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [filterLinkId, setFilterLinkId] = useState<string>('all')
  const [viewingLinkId, setViewingLinkId] = useState<string | null>(null)

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState<SignUpLink | null>(null)

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ─── Load data ──────────────────────────────────────────────────────────────

  const loadLinks = async () => {
    setLoadingLinks(true)
    try {
      const snap = await getDocs(query(collection(db, 'signUpLinks'), orderBy('createdAt', 'desc')))
      setLinks(snap.docs.map(d => ({ id: d.id, ...d.data() } as SignUpLink)))
    } catch {
      setLinks([])
    } finally {
      setLoadingLinks(false)
    }
  }

  const loadSubmissions = async () => {
    setLoadingSubmissions(true)
    try {
      const snap = await getDocs(query(collection(db, 'signUpSubmissions'), orderBy('submittedAt', 'desc')))
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Submission)))
    } catch {
      setSubmissions([])
    } finally {
      setLoadingSubmissions(false)
    }
  }

  useEffect(() => { loadLinks() }, [])

  useEffect(() => {
    if (tab === 'submissions') loadSubmissions()
  }, [tab])

  // ─── Form helpers ────────────────────────────────────────────────────────────

  const setField = (key: string, value: string | boolean) => {
    setForm(prev => {
      const updated = { ...prev, [key]: value }
      if (key === 'title' && !slugManual) {
        updated.slug = slugify(value as string)
      }
      return updated
    })
  }

  const uploadImage = (file: File, pathPrefix: string, progressKey: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const storageRef = ref(storage, `${pathPrefix}/${Date.now()}.${ext}`)
      const task = uploadBytesResumable(storageRef, file)
      task.on(
        'state_changed',
        snap => setUploadProgress(p => ({ ...p, [progressKey]: Math.round(snap.bytesTransferred / snap.totalBytes * 100) })),
        err => reject(err),
        async () => {
          setUploadProgress(p => { const n = { ...p }; delete n[progressKey]; return n })
          resolve(await getDownloadURL(task.snapshot.ref))
        }
      )
    })
  }

  const startEdit = (link: SignUpLink) => {
    setEditingId(link.id)
    setForm({
      title: link.title,
      description: link.description,
      slug: link.slug,
      mainImageURL: link.mainImageURL ?? '',
      backgroundImageURL: link.backgroundImageURL ?? '',
      backgroundColorHex: link.backgroundColorHex,
      textColorHex: link.textColorHex,
      fontFamily: link.fontFamily,
      appStoreURL: link.appStoreURL,
      active: link.active,
      scheduledStartAt: link.scheduledStartAt ? new Date(link.scheduledStartAt.seconds * 1000).toISOString().slice(0, 16) : '',
      scheduledEndAt: link.scheduledEndAt ? new Date(link.scheduledEndAt.seconds * 1000).toISOString().slice(0, 16) : '',
    })
    setSlugManual(true)
    setMainImagePreview(link.mainImageURL ?? null)
    setBgImagePreview(link.backgroundImageURL ?? null)
    setMainImageFile(null)
    setBgImageFile(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setSlugManual(false)
    setMainImageFile(null)
    setMainImagePreview(null)
    setBgImageFile(null)
    setBgImagePreview(null)
  }

  const handleSave = async () => {
    if (!form.title || !form.slug) return
    setSaving(true)
    try {
      let mainImageURL = form.mainImageURL
      let backgroundImageURL = form.backgroundImageURL

      if (mainImageFile) {
        mainImageURL = await uploadImage(mainImageFile, 'signup-main-images', 'main')
      }
      if (bgImageFile) {
        backgroundImageURL = await uploadImage(bgImageFile, 'signup-bg-images', 'bg')
      }

      const payload = {
        slug: form.slug,
        title: form.title,
        description: form.description,
        mainImageURL,
        backgroundImageURL,
        backgroundColorHex: form.backgroundColorHex,
        textColorHex: form.textColorHex,
        fontFamily: form.fontFamily,
        appStoreURL: form.appStoreURL,
        active: form.active,
        scheduledStartAt: form.scheduledStartAt ? Timestamp.fromDate(new Date(form.scheduledStartAt)) : null,
        scheduledEndAt: form.scheduledEndAt ? Timestamp.fromDate(new Date(form.scheduledEndAt)) : null,
      }

      if (editingId) {
        await updateDoc(doc(db, 'signUpLinks', editingId), payload)
      } else {
        await addDoc(collection(db, 'signUpLinks'), {
          ...payload,
          createdAt: Timestamp.now(),
          submissionCount: 0,
        })
      }

      closeForm()
      loadLinks()
    } catch (err: unknown) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    await deleteDoc(doc(db, 'signUpLinks', confirmDelete.id))
    setConfirmDelete(null)
    loadLinks()
  }

  const copyLink = (link: SignUpLink) => {
    const url = `${PUBLIC_BASE}/s/${link.slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(link.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const viewSubmissions = (linkId: string) => {
    setFilterLinkId(linkId)
    setViewingLinkId(linkId)
    setTab('submissions')
    loadSubmissions()
  }

  // ─── CSV Export ──────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const filtered = filterLinkId === 'all' ? submissions : submissions.filter(s => s.linkId === filterLinkId)
    const header = ['Date', 'Name', 'Email', 'Phone', 'Instagram', 'Link']
    const rows = filtered.map(s => [
      fmtDateTime(s.submittedAt),
      s.userName,
      s.userEmail,
      s.userPhone ?? '',
      s.instagramUsername ? `@${s.instagramUsername}` : '',
      s.linkTitle,
    ])
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `signup-submissions-${Date.now()}.csv`
    a.click()
  }

  // ─── Image upload picker ─────────────────────────────────────────────────────

  const ImagePicker = ({
    label, file, preview, inputRef, progressKey, onFile, onClear
  }: {
    label: string
    file: File | null
    preview: string | null
    inputRef: React.RefObject<HTMLInputElement | null>
    progressKey: string
    onFile: (f: File) => void
    onClear: () => void
  }) => (
    <div>
      <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>{label}</label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {preview ? (
        <div className="relative rounded-xl overflow-hidden" style={{ height: 120 }}>
          <img src={preview} alt="preview" className="w-full h-full object-cover" />
          {uploadProgress[progressKey] !== undefined && (
            <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: '#f0f0f2' }}>
              <div className="h-full transition-all" style={{ background: '#111111', width: `${uploadProgress[progressKey]}%` }} />
            </div>
          )}
          <div className="absolute inset-0 flex items-end p-2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)' }}>
            <button type="button" onClick={onClear}
              className="text-[10px] px-2 py-1 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl flex flex-col items-center justify-center gap-2 transition-colors"
          style={{ height: 90, border: '2px dashed #d0d0d5', background: '#ffffff' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#111111')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#d0d0d5')}>
          <span className="text-lg">🖼</span>
          <span className="text-[11px]" style={{ color: '#6e6e73' }}>Click to upload</span>
        </button>
      )}
    </div>
  )

  // ─── Filtered submissions ────────────────────────────────────────────────────

  const filteredSubmissions = filterLinkId === 'all'
    ? submissions
    : submissions.filter(s => s.linkId === filterLinkId)

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>

      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <div>
          <h1 className="text-base font-bold text-gray-900">Sign Up Links</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>
            {links.length} link{links.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); if (showForm) closeForm() }}
          className="px-4 py-2 rounded-lg text-xs font-semibold"
          style={{ background: '#111111', color: '#fff' }}>
          {showForm ? 'Cancel' : '+ New Link'}
        </button>
      </div>

      <div className="p-8 space-y-5">

        {/* Create / Edit Form */}
        {showForm && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
            <div className="px-6 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
              <span className="text-xs font-semibold text-gray-900">
                {editingId ? 'Edit Link' : 'New Sign Up Link'}
              </span>
              <button onClick={closeForm} className="text-xs" style={{ color: '#6e6e73' }}>✕</button>
            </div>

            <div className="p-6" style={{ background: '#f5f5f7' }}>
              <div className="grid grid-cols-2 gap-4">

                {/* Title */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setField('title', e.target.value)}
                    placeholder="e.g. Mansion Saturday Nights"
                    className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                    style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                  />
                </div>

                {/* Slug */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Slug</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={e => { setSlugManual(true); setField('slug', slugify(e.target.value)) }}
                    placeholder="auto-generated"
                    className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none font-mono"
                    style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                  />
                  {form.slug && (
                    <p className="text-[10px] mt-1" style={{ color: '#6e6e73' }}>
                      {PUBLIC_BASE}/s/{form.slug}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div className="col-span-2">
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setField('description', e.target.value)}
                    rows={2}
                    placeholder="Short description shown on the sign up page"
                    className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none resize-none"
                    style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                  />
                </div>

                {/* Images */}
                <ImagePicker
                  label="Main Image"
                  file={mainImageFile}
                  preview={mainImagePreview}
                  inputRef={mainImageRef}
                  progressKey="main"
                  onFile={f => { setMainImageFile(f); setMainImagePreview(URL.createObjectURL(f)) }}
                  onClear={() => { setMainImageFile(null); setMainImagePreview(null); setForm(p => ({ ...p, mainImageURL: '' })) }}
                />
                <ImagePicker
                  label="Background Image"
                  file={bgImageFile}
                  preview={bgImagePreview}
                  inputRef={bgImageRef}
                  progressKey="bg"
                  onFile={f => { setBgImageFile(f); setBgImagePreview(URL.createObjectURL(f)) }}
                  onClear={() => { setBgImageFile(null); setBgImagePreview(null); setForm(p => ({ ...p, backgroundImageURL: '' })) }}
                />

                {/* Colors */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Background Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.backgroundColorHex}
                      onChange={e => setField('backgroundColorHex', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                      style={{ padding: 2 }}
                    />
                    <input
                      type="text"
                      value={form.backgroundColorHex}
                      onChange={e => setField('backgroundColorHex', e.target.value)}
                      className="flex-1 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none font-mono"
                      style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Text Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.textColorHex}
                      onChange={e => setField('textColorHex', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                      style={{ padding: 2 }}
                    />
                    <input
                      type="text"
                      value={form.textColorHex}
                      onChange={e => setField('textColorHex', e.target.value)}
                      className="flex-1 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none font-mono"
                      style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                    />
                  </div>
                </div>

                {/* Font family */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Font</label>
                  <div className="flex gap-2">
                    {(['sans-serif', 'serif', 'display'] as FontFamily[]).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setField('fontFamily', f)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
                        style={{
                          background: form.fontFamily === f ? '#111111' : '#f0f0f2',
                          color: form.fontFamily === f ? '#ffffff' : '#6e6e73',
                          border: `1px solid ${form.fontFamily === f ? '#111111' : '#e5e5ea'}`,
                        }}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* App Store URL */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>App Store URL</label>
                  <input
                    type="url"
                    value={form.appStoreURL}
                    onChange={e => setField('appStoreURL', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                    style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                  />
                </div>

                {/* Schedule */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Go Live At (optional)</label>
                  <input
                    type="datetime-local"
                    value={form.scheduledStartAt}
                    onChange={e => setField('scheduledStartAt', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                    style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>End At (optional)</label>
                  <input
                    type="datetime-local"
                    value={form.scheduledEndAt}
                    onChange={e => setField('scheduledEndAt', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                    style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}
                  />
                </div>

                {/* Active toggle */}
                <div className="col-span-2 flex items-center gap-3">
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: '#6e6e73' }}>Active</span>
                  <button
                    type="button"
                    onClick={() => setField('active', !form.active)}
                    className="w-10 h-6 rounded-full transition-all relative flex-shrink-0"
                    style={{ background: form.active ? '#111111' : '#e5e5ea' }}>
                    <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
                      style={{ left: form.active ? 22 : 4 }} />
                  </button>
                  <span className="text-xs" style={{ color: '#6e6e73' }}>
                    {form.active ? 'Link is accepting submissions' : 'Link is paused'}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleSave}
                  disabled={saving || !form.title || !form.slug}
                  className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: '#111111', color: '#fff' }}>
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Link'}
                </button>
                <button
                  onClick={closeForm}
                  className="px-4 py-2 rounded-lg text-xs"
                  style={{ background: '#f0f0f2', color: '#6e6e73' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: '#ebebed' }}>
          {(['links', 'submissions'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-1.5 rounded-md text-xs font-semibold capitalize transition-all"
              style={{
                background: tab === t ? '#ffffff' : 'transparent',
                color: tab === t ? '#111111' : '#6e6e73',
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Links Tab ── */}
        {tab === 'links' && (
          <>
            {loadingLinks ? (
              <div className="text-xs" style={{ color: '#6e6e73' }}>Loading…</div>
            ) : links.length === 0 ? (
              <div className="rounded-xl p-16 text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                <div className="text-xs" style={{ color: '#6e6e73' }}>No sign up links yet — create one to get started</div>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
                      {['Title', 'Slug', 'Status', 'Submissions', 'Created', ''].map(h => (
                        <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider"
                          style={{ color: '#6e6e73', fontSize: 10 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ background: '#f5f5f7' }}>
                    {links.map((link, i) => (
                      <tr key={link.id} style={{ borderBottom: i < links.length - 1 ? '1px solid #f0f0f2' : 'none' }}>
                        <td className="px-5 py-3 font-medium text-gray-900">{link.title}</td>
                        <td className="px-5 py-3">
                          <span className="font-mono" style={{ color: '#6e6e73' }}>/s/{link.slug}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                            style={link.active
                              ? { background: '#0a2010', color: '#16a34a' }
                              : { background: '#1a1400', color: '#6e6e73' }}>
                            {link.active ? 'Active' : 'Paused'}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-900">{link.submissionCount ?? 0}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{fmtDate(link.createdAt)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => copyLink(link)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                              style={copiedId === link.id
                                ? { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }
                                : { background: '#f0f0f2', color: '#111111', border: '1px solid #e5e5ea' }}>
                              {copiedId === link.id ? 'Copied!' : 'Copy link'}
                            </button>
                            <button
                              onClick={() => viewSubmissions(link.id)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                              style={{ background: '#f0f0f2', color: '#111111', border: '1px solid #e5e5ea' }}>
                              View submissions
                            </button>
                            <button
                              onClick={() => startEdit(link)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                              style={{ background: '#f0f0f2', color: '#111111', border: '1px solid #e5e5ea' }}>
                              Edit
                            </button>
                            <button
                              onClick={() => setConfirmDelete(link)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Submissions Tab ── */}
        {tab === 'submissions' && (
          <>
            {/* Filter + Export bar */}
            <div className="flex items-center gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest mr-2" style={{ color: '#6e6e73' }}>Filter by link</label>
                <select
                  value={filterLinkId}
                  onChange={e => setFilterLinkId(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none"
                  style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                  <option value="all">All links</option>
                  {links.map(l => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1" />
              <button
                onClick={exportCSV}
                disabled={filteredSubmissions.length === 0}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                style={{ background: '#111111', color: '#fff' }}>
                Export CSV
              </button>
            </div>

            {loadingSubmissions ? (
              <div className="text-xs" style={{ color: '#6e6e73' }}>Loading…</div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="rounded-xl p-16 text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                <div className="text-xs" style={{ color: '#6e6e73' }}>No submissions yet</div>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
                      {['Date', 'Name', 'Email', 'Phone', 'Instagram', 'Link'].map(h => (
                        <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider"
                          style={{ color: '#6e6e73', fontSize: 10 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ background: '#f5f5f7' }}>
                    {filteredSubmissions.map((sub, i) => (
                      <tr key={sub.id}
                        style={{ borderBottom: i < filteredSubmissions.length - 1 ? '1px solid #f0f0f2' : 'none' }}>
                        <td className="px-5 py-3 whitespace-nowrap" style={{ color: '#6e6e73' }}>
                          {fmtDateTime(sub.submittedAt)}
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-900">{sub.userName}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{sub.userEmail}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{sub.userPhone ?? '—'}</td>
                        <td className="px-5 py-3">
                          {sub.instagramUsername ? (
                            <a
                              href={`https://instagram.com/${sub.instagramUsername}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium transition-colors"
                              style={{ color: '#111111' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#6e6e73')}
                              onMouseLeave={e => (e.currentTarget.style.color = '#111111')}>
                              @{sub.instagramUsername}
                            </a>
                          ) : (
                            <span style={{ color: '#6e6e73' }}>—</span>
                          )}
                        </td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{sub.linkTitle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="rounded-2xl p-8 w-full max-w-sm text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#fee2e2' }}>
              <span className="text-xl">🗑</span>
            </div>
            <h2 className="text-sm font-bold text-gray-900 mb-2">Delete this link?</h2>
            <p className="text-xs leading-relaxed mb-2" style={{ color: '#6e6e73' }}>
              "{confirmDelete.title}" will be permanently deleted.
            </p>
            <p className="text-xs leading-relaxed mb-6" style={{ color: '#dc2626' }}>
              Existing submissions will not be deleted, but the link will stop working.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-lg text-xs font-medium"
                style={{ background: '#f0f0f2', color: '#6e6e73', border: '1px solid #e5e5ea' }}>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
