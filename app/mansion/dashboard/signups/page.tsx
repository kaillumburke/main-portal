'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, Timestamp
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'

// ─── Types ────────────────────────────────────────────────────────────────────

type FontFamily = 'sans-serif' | 'serif' | 'display'

export interface EmailConfig {
  enabled: boolean
  subject: string
  preheader: string
  headerImageURL: string
  bgColor: string
  cardBgColor: string
  textColor: string
  heading: string
  body: string
  hasImage: boolean
  imageURL: string
  hasButton: boolean
  buttonText: string
  buttonColor: string
  buttonTextColor: string
  buttonURL: string
  footerText: string
  sendAt?: string
}

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
  senderName?: string
  confirmationEmail?: EmailConfig
  followUp1?: EmailConfig
  followUp2?: EmailConfig
  // Legacy flat fields
  emailSubject?: string
  emailBody?: string
  followUp1Subject?: string
  followUp1Body?: string
  followUp1SendAt?: Timestamp
  followUp2Subject?: string
  followUp2Body?: string
  followUp2SendAt?: Timestamp
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
  return str.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60)
}

function fmtDate(ts: Timestamp | undefined) {
  if (!ts) return '—'
  return new Date(ts.seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(ts: Timestamp | undefined) {
  if (!ts) return '—'
  const d = new Date(ts.seconds * 1000)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function generateEmailHTML(cfg: EmailConfig, previewName = '{{name}}'): string {
  const body = cfg.body.replace(/\{\{name\}\}/g, previewName).replace(/\n/g, '<br>')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.subject || 'Email'}</title></head>
<body style="margin:0;padding:0;background:${cfg.bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${cfg.bgColor}">
<tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${cfg.cardBgColor};border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
${cfg.headerImageURL ? `<tr><td><img src="${cfg.headerImageURL}" width="600" alt="" style="display:block;width:100%;height:auto;max-height:320px;object-fit:cover"></td></tr>` : ''}
<tr><td style="padding:40px 40px 32px">
${cfg.heading ? `<h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;color:${cfg.textColor};font-weight:700;letter-spacing:-0.3px">${cfg.heading}</h1>` : ''}
<div style="font-size:15px;line-height:1.7;color:${cfg.textColor}">${body}</div>
${cfg.hasImage && cfg.imageURL ? `<img src="${cfg.imageURL}" alt="" style="display:block;width:100%;border-radius:8px;margin:28px 0">` : ''}
${cfg.hasButton ? `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr><td><a href="${cfg.buttonURL || '#'}" style="display:inline-block;background:${cfg.buttonColor};color:${cfg.buttonTextColor};padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.1px">${cfg.buttonText || 'Click here'}</a></td></tr></table>` : ''}
</td></tr>
${cfg.footerText ? `<tr><td style="padding:20px 40px;border-top:1px solid #e5e5ea"><p style="margin:0;font-size:12px;color:#6e6e73;line-height:1.5">${cfg.footerText}</p></td></tr>` : ''}
</table>
</td></tr>
</table>
</body></html>`
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const emptyEmailConfig: EmailConfig = {
  enabled: false,
  subject: '',
  preheader: '',
  headerImageURL: '',
  bgColor: '#f5f5f7',
  cardBgColor: '#ffffff',
  textColor: '#111111',
  heading: '',
  body: '',
  hasImage: false,
  imageURL: '',
  hasButton: false,
  buttonText: 'View details',
  buttonColor: '#111111',
  buttonTextColor: '#ffffff',
  buttonURL: '',
  footerText: '',
}

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
  senderName: '',
  confirmationEmail: { ...emptyEmailConfig },
  followUp1: { ...emptyEmailConfig, sendAt: '' },
  followUp2: { ...emptyEmailConfig, sendAt: '' },
}

// ─── EmailBuilder ─────────────────────────────────────────────────────────────

function ColorRow({ label, cfgKey, config, onChange }: {
  label: string
  cfgKey: keyof EmailConfig
  config: EmailConfig
  onChange: (k: keyof EmailConfig, v: string) => void
}) {
  return (
    <div>
      <div className="text-[10px] mb-1" style={{ color: '#6e6e73' }}>{label}</div>
      <div className="flex items-center gap-1.5">
        <input type="color" value={config[cfgKey] as string} onChange={e => onChange(cfgKey, e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border-0 flex-shrink-0" style={{ padding: 1 }} />
        <input type="text" value={config[cfgKey] as string} onChange={e => onChange(cfgKey, e.target.value)}
          className="flex-1 rounded px-2 py-1.5 text-[11px] outline-none font-mono min-w-0 text-gray-900"
          style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
      </div>
    </div>
  )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className="w-9 h-5 rounded-full transition-all relative flex-shrink-0"
      style={{ background: on ? '#111111' : '#d1d1d6' }}>
      <div className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all"
        style={{ left: on ? 19 : 2 }} />
    </button>
  )
}

interface EmailBuilderProps {
  label: string
  subLabel: string
  config: EmailConfig
  onChange: (updated: EmailConfig) => void
  showSendAt?: boolean
  uploadImage: (file: File, path: string) => Promise<string>
}

function EmailBuilder({ label, subLabel, config, onChange, showSendAt, uploadImage }: EmailBuilderProps) {
  const [tab, setTab] = useState<'content' | 'design' | 'preview'>('content')
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const headerImgRef = useRef<HTMLInputElement>(null)
  const bodyImgRef = useRef<HTMLInputElement>(null)

  const set = (key: keyof EmailConfig, value: unknown) => onChange({ ...config, [key]: value })

  const handleUpload = async (file: File, key: 'headerImageURL' | 'imageURL') => {
    setUploading(u => ({ ...u, [key]: true }))
    try {
      const url = await uploadImage(file, `email-images/${Date.now()}.${file.name.split('.').pop() ?? 'jpg'}`)
      set(key, url)
    } finally {
      setUploading(u => ({ ...u, [key]: false }))
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea', background: '#ffffff' }}>
      {/* Header toggle */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: config.enabled ? '1px solid #f0f0f2' : 'none' }}>
        <div>
          <div className="text-xs font-semibold text-gray-900">{label}</div>
          <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>{subLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <Toggle on={config.enabled} onToggle={() => set('enabled', !config.enabled)} />
          <span className="text-[10px]" style={{ color: config.enabled ? '#111111' : '#6e6e73' }}>
            {config.enabled ? 'On' : 'Off'}
          </span>
        </div>
      </div>

      {config.enabled && (
        <>
          {/* Tab bar */}
          <div className="flex" style={{ borderBottom: '1px solid #f0f0f2', background: '#fafafa' }}>
            {(['content', 'design', 'preview'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className="px-5 py-2.5 text-[11px] font-semibold capitalize transition-colors"
                style={{
                  borderBottom: tab === t ? '2px solid #111111' : '2px solid transparent',
                  color: tab === t ? '#111111' : '#6e6e73',
                  background: 'transparent',
                }}>
                {t === 'content' ? 'Content' : t === 'design' ? 'Design' : 'Preview'}
              </button>
            ))}
          </div>

          {/* Content tab */}
          {tab === 'content' && (
            <div className="p-5 flex flex-col gap-4">
              {/* Subject + Preheader */}
              <div>
                <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Subject line</label>
                <input type="text" value={config.subject} onChange={e => set('subject', e.target.value)}
                  placeholder="e.g. You're on the list 🎉"
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>
                  Preheader <span style={{ textTransform: 'none', letterSpacing: 0, color: '#aaa' }}>(inbox preview text — optional)</span>
                </label>
                <input type="text" value={config.preheader} onChange={e => set('preheader', e.target.value)}
                  placeholder="Short preview text shown after the subject in the inbox…"
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
              </div>

              {/* Send at — follow-ups only */}
              {showSendAt && (
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Send date & time</label>
                  <input type="datetime-local" value={(config as any).sendAt ?? ''}
                    onChange={e => set('sendAt' as keyof EmailConfig, e.target.value as any)}
                    className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                    style={{ background: '#f5f5f7', border: '1px solid #e5e5ea', colorScheme: 'light' }} />
                </div>
              )}

              {/* Header image */}
              <div>
                <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>
                  Header image <span style={{ textTransform: 'none', letterSpacing: 0, color: '#aaa' }}>(optional — spans full width)</span>
                </label>
                <input ref={headerImgRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'headerImageURL') }} />
                <div className="flex gap-2">
                  <input type="url" value={config.headerImageURL} onChange={e => set('headerImageURL', e.target.value)}
                    placeholder="Paste image URL or upload…"
                    className="flex-1 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                    style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                  <button type="button" onClick={() => headerImgRef.current?.click()}
                    className="px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0"
                    style={{ background: '#f0f0f2', color: '#111111', border: '1px solid #e5e5ea' }}>
                    {uploading.headerImageURL ? 'Uploading…' : '↑ Upload'}
                  </button>
                </div>
                {config.headerImageURL && (
                  <div className="mt-2 relative rounded-lg overflow-hidden" style={{ height: 90 }}>
                    <img src={config.headerImageURL} className="w-full h-full object-cover" alt="" />
                    <button type="button" onClick={() => set('headerImageURL', '')}
                      className="absolute top-1.5 right-1.5 text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{ background: '#fee2e2', color: '#dc2626' }}>Remove</button>
                  </div>
                )}
              </div>

              {/* Heading */}
              <div>
                <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>
                  Heading <span style={{ textTransform: 'none', letterSpacing: 0, color: '#aaa' }}>(optional)</span>
                </label>
                <input type="text" value={config.heading} onChange={e => set('heading', e.target.value)}
                  placeholder="e.g. You're on the list!"
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
              </div>

              {/* Body */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-[10px] uppercase tracking-widest" style={{ color: '#6e6e73' }}>Message body</label>
                  <span className="text-[10px]" style={{ color: '#aaa' }}>Use {'{{name}}'} for the recipient's name</span>
                </div>
                <textarea value={config.body} onChange={e => set('body', e.target.value)}
                  placeholder={"Hi {{name}},\n\nThanks for signing up! We'll be in touch soon.\n\nMansion Liverpool"}
                  rows={7}
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none resize-none"
                  style={{ background: '#f5f5f7', border: '1px solid #e5e5ea', fontFamily: 'inherit' }} />
              </div>

              {/* Image block */}
              <div className="rounded-lg p-4" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Toggle on={config.hasImage} onToggle={() => set('hasImage', !config.hasImage)} />
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: '#6e6e73' }}>Include image block</span>
                </div>
                {config.hasImage && (
                  <div className="mt-3">
                    <input ref={bodyImgRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'imageURL') }} />
                    <div className="flex gap-2">
                      <input type="url" value={config.imageURL} onChange={e => set('imageURL', e.target.value)}
                        placeholder="Paste image URL or upload…"
                        className="flex-1 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                        style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                      <button type="button" onClick={() => bodyImgRef.current?.click()}
                        className="px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0"
                        style={{ background: '#ffffff', color: '#111111', border: '1px solid #e5e5ea' }}>
                        {uploading.imageURL ? 'Uploading…' : '↑ Upload'}
                      </button>
                    </div>
                    {config.imageURL && <img src={config.imageURL} className="mt-2 rounded-lg w-full object-cover" style={{ maxHeight: 120 }} alt="" />}
                  </div>
                )}
              </div>

              {/* Button */}
              <div className="rounded-lg p-4" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Toggle on={config.hasButton} onToggle={() => set('hasButton', !config.hasButton)} />
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: '#6e6e73' }}>Include call-to-action button</span>
                </div>
                {config.hasButton && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: '#6e6e73' }}>Button label</label>
                      <input type="text" value={config.buttonText} onChange={e => set('buttonText', e.target.value)}
                        placeholder="Get tickets"
                        className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                        style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                    </div>
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: '#6e6e73' }}>Link URL</label>
                      <input type="url" value={config.buttonURL} onChange={e => set('buttonURL', e.target.value)}
                        placeholder="https://…"
                        className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                        style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                    </div>
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: '#6e6e73' }}>Button background</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={config.buttonColor} onChange={e => set('buttonColor', e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer border-0 flex-shrink-0" style={{ padding: 1 }} />
                        <input type="text" value={config.buttonColor} onChange={e => set('buttonColor', e.target.value)}
                          className="flex-1 rounded px-2 py-1.5 text-[11px] text-gray-900 outline-none font-mono"
                          style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: '#6e6e73' }}>Button text color</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={config.buttonTextColor} onChange={e => set('buttonTextColor', e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer border-0 flex-shrink-0" style={{ padding: 1 }} />
                        <input type="text" value={config.buttonTextColor} onChange={e => set('buttonTextColor', e.target.value)}
                          className="flex-1 rounded px-2 py-1.5 text-[11px] text-gray-900 outline-none font-mono"
                          style={{ background: '#ffffff', border: '1px solid #e5e5ea' }} />
                      </div>
                    </div>
                    {/* Live button preview */}
                    <div className="col-span-2 flex items-center gap-3 pt-1">
                      <span className="text-[10px]" style={{ color: '#6e6e73' }}>Preview:</span>
                      <span style={{ display: 'inline-block', background: config.buttonColor, color: config.buttonTextColor, padding: '8px 20px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                        {config.buttonText || 'Click here'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div>
                <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>
                  Footer text <span style={{ textTransform: 'none', letterSpacing: 0, color: '#aaa' }}>(optional)</span>
                </label>
                <input type="text" value={config.footerText} onChange={e => set('footerText', e.target.value)}
                  placeholder="e.g. Mansion Liverpool · 8 Fleet St, Liverpool L1 4DQ"
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
              </div>
            </div>
          )}

          {/* Design tab */}
          {tab === 'design' && (
            <div className="p-5 flex flex-col gap-5">
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: '#6e6e73' }}>Email colours</div>
                <div className="grid grid-cols-3 gap-3">
                  <ColorRow label="Email background" cfgKey="bgColor" config={config} onChange={set} />
                  <ColorRow label="Card background" cfgKey="cardBgColor" config={config} onChange={set} />
                  <ColorRow label="Text colour" cfgKey="textColor" config={config} onChange={set} />
                </div>
              </div>
              {/* Live colour preview */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
                <div className="px-4 py-2 text-[10px] uppercase tracking-widest" style={{ background: '#f5f5f7', color: '#6e6e73', borderBottom: '1px solid #e5e5ea' }}>Colour preview</div>
                <div style={{ background: config.bgColor, padding: '24px 16px' }}>
                  <div style={{ background: config.cardBgColor, borderRadius: 8, padding: '20px 24px', maxWidth: 300, margin: '0 auto', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                    <div style={{ color: config.textColor, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Heading text</div>
                    <div style={{ color: config.textColor, fontSize: 13, lineHeight: 1.6 }}>This is how your email body text will look with these colours.</div>
                    {config.hasButton && (
                      <div style={{ marginTop: 16 }}>
                        <span style={{ display: 'inline-block', background: config.buttonColor, color: config.buttonTextColor, padding: '10px 20px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                          {config.buttonText || 'Button'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview tab */}
          {tab === 'preview' && (
            <div className="p-5">
              <div className="text-[10px] mb-3" style={{ color: '#6e6e73' }}>
                Preview with name "Alex" — appearance may vary slightly between email clients
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
                <iframe
                  srcDoc={generateEmailHTML(config, 'Alex')}
                  style={{ width: '100%', height: 600, border: 'none', display: 'block' }}
                  title="Email preview"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SignUpsPage() {
  const [tab, setTab] = useState<'links' | 'submissions'>('links')
  const [links, setLinks] = useState<SignUpLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [slugManual, setSlugManual] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mainImageFile, setMainImageFile] = useState<File | null>(null)
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null)
  const [bgImageFile, setBgImageFile] = useState<File | null>(null)
  const [bgImagePreview, setBgImagePreview] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const mainImageRef = useRef<HTMLInputElement>(null)
  const bgImageRef = useRef<HTMLInputElement>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [filterLinkId, setFilterLinkId] = useState<string>('all')
  const [confirmDelete, setConfirmDelete] = useState<SignUpLink | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadLinks = async () => {
    setLoadingLinks(true)
    try {
      const snap = await getDocs(query(collection(db, 'signUpLinks'), orderBy('createdAt', 'desc')))
      setLinks(snap.docs.map(d => ({ id: d.id, ...d.data() } as SignUpLink)))
    } catch { setLinks([]) }
    finally { setLoadingLinks(false) }
  }

  const loadSubmissions = async () => {
    setLoadingSubmissions(true)
    try {
      const snap = await getDocs(query(collection(db, 'signUpSubmissions'), orderBy('submittedAt', 'desc')))
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Submission)))
    } catch { setSubmissions([]) }
    finally { setLoadingSubmissions(false) }
  }

  useEffect(() => { loadLinks() }, [])
  useEffect(() => { if (tab === 'submissions') loadSubmissions() }, [tab])

  const setField = (key: string, value: unknown) => {
    setForm(prev => {
      const updated = { ...prev, [key]: value }
      if (key === 'title' && !slugManual) updated.slug = slugify(value as string)
      return updated
    })
  }

  const uploadImage = useCallback((file: File, pathPrefix: string, progressKey: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const storageRef = ref(storage, `${pathPrefix}/${Date.now()}.${ext}`)
      const task = uploadBytesResumable(storageRef, file)
      task.on('state_changed',
        snap => setUploadProgress(p => ({ ...p, [progressKey]: Math.round(snap.bytesTransferred / snap.totalBytes * 100) })),
        err => reject(err),
        async () => {
          setUploadProgress(p => { const n = { ...p }; delete n[progressKey]; return n })
          resolve(await getDownloadURL(task.snapshot.ref))
        })
    })
  }, [])

  const uploadEmailImage = useCallback(async (file: File, path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const storageRef = ref(storage, path)
      const task = uploadBytesResumable(storageRef, file)
      task.on('state_changed', () => {}, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)))
    })
  }, [])

  // Migrate old flat format to new EmailConfig structure
  const emailFromLegacy = (
    subject: string | undefined,
    body: string | undefined,
    sendAt?: Timestamp,
  ): EmailConfig => ({
    ...emptyEmailConfig,
    enabled: !!(subject?.trim()),
    subject: subject ?? '',
    body: body ?? '',
    sendAt: sendAt ? new Date(sendAt.seconds * 1000).toISOString().slice(0, 16) : '',
  })

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
      senderName: link.senderName ?? '',
      confirmationEmail: link.confirmationEmail ?? emailFromLegacy(link.emailSubject, link.emailBody),
      followUp1: link.followUp1 ?? emailFromLegacy(link.followUp1Subject, link.followUp1Body, link.followUp1SendAt),
      followUp2: link.followUp2 ?? emailFromLegacy(link.followUp2Subject, link.followUp2Body, link.followUp2SendAt),
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
      if (mainImageFile) mainImageURL = await uploadImage(mainImageFile, 'signup-main-images', 'main')
      if (bgImageFile) backgroundImageURL = await uploadImage(bgImageFile, 'signup-bg-images', 'bg')

      // Convert sendAt strings to Timestamps for follow-ups
      const fu1 = { ...form.followUp1 }
      const fu2 = { ...form.followUp2 }

      const payload: Record<string, unknown> = {
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
        senderName: form.senderName,
        confirmationEmail: form.confirmationEmail,
        followUp1: {
          ...fu1,
          sendAt: (fu1 as any).sendAt && (fu1 as any).sendAt !== ''
            ? Timestamp.fromDate(new Date((fu1 as any).sendAt))
            : null,
        },
        followUp2: {
          ...fu2,
          sendAt: (fu2 as any).sendAt && (fu2 as any).sendAt !== ''
            ? Timestamp.fromDate(new Date((fu2 as any).sendAt))
            : null,
        },
      }

      if (editingId) {
        await updateDoc(doc(db, 'signUpLinks', editingId), payload)
      } else {
        await addDoc(collection(db, 'signUpLinks'), { ...payload, createdAt: Timestamp.now(), submissionCount: 0 })
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
    navigator.clipboard.writeText(`${PUBLIC_BASE}/s/${link.slug}`).then(() => {
      setCopiedId(link.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const filteredSubmissions = filterLinkId === 'all' ? submissions : submissions.filter(s => s.linkId === filterLinkId)

  const exportCSV = () => {
    const header = ['Date', 'Name', 'Email', 'Phone', 'Instagram', 'Link']
    const rows = filteredSubmissions.map(s => [fmtDateTime(s.submittedAt), s.userName, s.userEmail, s.userPhone ?? '', s.instagramUsername ? `@${s.instagramUsername}` : '', s.linkTitle])
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `signup-submissions-${Date.now()}.csv`
    a.click()
  }

  const ImagePicker = ({
    label, file, preview, inputRef, progressKey, onFile, onClear
  }: {
    label: string; file: File | null; preview: string | null
    inputRef: React.RefObject<HTMLInputElement | null>; progressKey: string
    onFile: (f: File) => void; onClear: () => void
  }) => (
    <div>
      <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>{label}</label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {preview ? (
        <div className="relative rounded-xl overflow-hidden" style={{ height: 120 }}>
          <img src={preview} alt="preview" className="w-full h-full object-cover" />
          {uploadProgress[progressKey] !== undefined && (
            <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: '#f0f0f2' }}>
              <div className="h-full" style={{ background: '#111111', width: `${uploadProgress[progressKey]}%` }} />
            </div>
          )}
          <div className="absolute inset-0 flex items-end p-2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 60%)' }}>
            <button type="button" onClick={onClear} className="text-[10px] px-2 py-1 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl flex flex-col items-center justify-center gap-2"
          style={{ height: 90, border: '2px dashed #d0d0d5', background: '#fafafa' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#111111')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#d0d0d5')}>
          <span className="text-lg">🖼</span>
          <span className="text-[11px]" style={{ color: '#6e6e73' }}>Click to upload</span>
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>

      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <div>
          <h1 className="text-base font-bold text-gray-900">Sign Up Links</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>{links.length} link{links.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); if (showForm) closeForm() }}
          className="px-4 py-2 rounded-lg text-xs font-semibold"
          style={{ background: '#111111', color: '#fff' }}>
          {showForm ? 'Cancel' : '+ New Link'}
        </button>
      </div>

      <div className="p-8 space-y-5">

        {/* Form */}
        {showForm && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
            <div className="px-6 py-3 flex items-center justify-between" style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f2' }}>
              <span className="text-xs font-semibold text-gray-900">{editingId ? 'Edit Link' : 'New Sign Up Link'}</span>
              <button onClick={closeForm} className="text-xs" style={{ color: '#6e6e73' }}>✕</button>
            </div>

            <div className="p-6 flex flex-col gap-4" style={{ background: '#f5f5f7' }}>

              {/* ── Basic Info ── */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                <div className="pb-2" style={{ borderBottom: '1px solid #f0f0f2' }}>
                  <span className="text-[11px] uppercase tracking-widest font-bold text-gray-900">Basic Info</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Title</label>
                    <input type="text" value={form.title} onChange={e => setField('title', e.target.value)}
                      placeholder="e.g. Mansion Saturday Nights"
                      className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                      style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Slug</label>
                    <input type="text" value={form.slug}
                      onChange={e => { setSlugManual(true); setField('slug', slugify(e.target.value)) }}
                      placeholder="auto-generated"
                      className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none font-mono"
                      style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                    {form.slug && <p className="text-[10px] mt-1" style={{ color: '#6e6e73' }}>{PUBLIC_BASE}/s/{form.slug}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Description</label>
                    <textarea value={form.description} onChange={e => setField('description', e.target.value)} rows={2}
                      placeholder="Short description shown on the sign up page"
                      className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none resize-none"
                      style={{ background: '#f5f5f7', border: '1px solid #e5e5ea', fontFamily: 'inherit' }} />
                  </div>
                </div>
              </div>

              {/* ── Appearance ── */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                <div className="pb-2" style={{ borderBottom: '1px solid #f0f0f2' }}>
                  <span className="text-[11px] uppercase tracking-widest font-bold text-gray-900">Appearance</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ImagePicker label="Main Image" file={mainImageFile} preview={mainImagePreview} inputRef={mainImageRef} progressKey="main"
                    onFile={f => { setMainImageFile(f); setMainImagePreview(URL.createObjectURL(f)) }}
                    onClear={() => { setMainImageFile(null); setMainImagePreview(null); setForm(p => ({ ...p, mainImageURL: '' })) }} />
                  <ImagePicker label="Background Image" file={bgImageFile} preview={bgImagePreview} inputRef={bgImageRef} progressKey="bg"
                    onFile={f => { setBgImageFile(f); setBgImagePreview(URL.createObjectURL(f)) }}
                    onClear={() => { setBgImageFile(null); setBgImagePreview(null); setForm(p => ({ ...p, backgroundImageURL: '' })) }} />
                  <div>
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Background Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.backgroundColorHex} onChange={e => setField('backgroundColorHex', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" style={{ padding: 2 }} />
                      <input type="text" value={form.backgroundColorHex} onChange={e => setField('backgroundColorHex', e.target.value)} className="flex-1 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none font-mono" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Text Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.textColorHex} onChange={e => setField('textColorHex', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" style={{ padding: 2 }} />
                      <input type="text" value={form.textColorHex} onChange={e => setField('textColorHex', e.target.value)} className="flex-1 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none font-mono" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Font</label>
                    <div className="flex gap-2">
                      {(['sans-serif', 'serif', 'display'] as FontFamily[]).map(f => (
                        <button key={f} type="button" onClick={() => setField('fontFamily', f)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
                          style={{ background: form.fontFamily === f ? '#111111' : '#f5f5f7', color: form.fontFamily === f ? '#ffffff' : '#6e6e73', border: `1px solid ${form.fontFamily === f ? '#111111' : '#e5e5ea'}` }}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Settings ── */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                <div className="pb-2" style={{ borderBottom: '1px solid #f0f0f2' }}>
                  <span className="text-[11px] uppercase tracking-widest font-bold text-gray-900">Settings</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>App Store URL</label>
                    <input type="url" value={form.appStoreURL} onChange={e => setField('appStoreURL', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                      style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Go Live At (optional)</label>
                    <input type="datetime-local" value={form.scheduledStartAt} onChange={e => setField('scheduledStartAt', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                      style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>End At (optional)</label>
                    <input type="datetime-local" value={form.scheduledEndAt} onChange={e => setField('scheduledEndAt', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                      style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                  </div>
                  <div className="col-span-2 flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: '#6e6e73' }}>Active</span>
                    <button type="button" onClick={() => setField('active', !form.active)}
                      className="w-10 h-6 rounded-full transition-all relative flex-shrink-0"
                      style={{ background: form.active ? '#111111' : '#d1d1d6' }}>
                      <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all" style={{ left: form.active ? 22 : 4 }} />
                    </button>
                    <span className="text-xs" style={{ color: '#6e6e73' }}>{form.active ? 'Link is accepting submissions' : 'Link is paused'}</span>
                  </div>
                </div>
              </div>

              {/* ── Emails ── */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                <div className="pb-2" style={{ borderBottom: '1px solid #f0f0f2' }}>
                  <div className="text-[11px] uppercase tracking-widest font-bold text-gray-900">Emails</div>
                  <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>Sent via Resend · From: {form.senderName || 'your sender name'} &lt;hello@connectclub.live&gt;</div>
                </div>

                {/* Sender name */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Sender name</label>
                  <input type="text" value={form.senderName} onChange={e => setField('senderName', e.target.value)}
                    placeholder="e.g. Mansion Liverpool"
                    className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                    style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                </div>

                {/* Confirmation */}
                <EmailBuilder
                  label="Confirmation email"
                  subLabel="Sent instantly when someone signs up"
                  config={form.confirmationEmail}
                  onChange={cfg => setForm(p => ({ ...p, confirmationEmail: cfg }))}
                  uploadImage={uploadEmailImage}
                />

                {/* Follow-up 1 */}
                <EmailBuilder
                  label="Follow-up email 1"
                  subLabel="Sent automatically at your chosen date & time"
                  config={form.followUp1}
                  onChange={cfg => setForm(p => ({ ...p, followUp1: cfg }))}
                  showSendAt
                  uploadImage={uploadEmailImage}
                />

                {/* Follow-up 2 */}
                <EmailBuilder
                  label="Follow-up email 2"
                  subLabel="Sent automatically at your chosen date & time"
                  config={form.followUp2}
                  onChange={cfg => setForm(p => ({ ...p, followUp2: cfg }))}
                  showSendAt
                  uploadImage={uploadEmailImage}
                />
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-3">
                <button onClick={handleSave} disabled={saving || !form.title || !form.slug}
                  className="px-5 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: '#111111', color: '#fff' }}>
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Link'}
                </button>
                <button onClick={closeForm} className="px-5 py-2.5 rounded-lg text-xs font-medium"
                  style={{ background: '#f0f0f2', color: '#6e6e73', border: '1px solid #e5e5ea' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: '#ebebed' }}>
          {(['links', 'submissions'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-5 py-1.5 rounded-md text-xs font-semibold capitalize transition-all"
              style={{ background: tab === t ? '#ffffff' : 'transparent', color: tab === t ? '#111111' : '#6e6e73', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {t}
            </button>
          ))}
        </div>

        {/* Links tab */}
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
                        <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ background: '#f5f5f7' }}>
                    {links.map((link, i) => (
                      <tr key={link.id} style={{ borderBottom: i < links.length - 1 ? '1px solid #f0f0f2' : 'none' }}>
                        <td className="px-5 py-3 font-medium text-gray-900">{link.title}</td>
                        <td className="px-5 py-3"><span className="font-mono" style={{ color: '#6e6e73' }}>/s/{link.slug}</span></td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                            style={link.active ? { background: '#f0fdf4', color: '#16a34a' } : { background: '#f5f5f7', color: '#6e6e73' }}>
                            {link.active ? 'Active' : 'Paused'}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-900">{link.submissionCount ?? 0}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{fmtDate(link.createdAt)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => copyLink(link)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                              style={copiedId === link.id ? { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' } : { background: '#f0f0f2', color: '#111111', border: '1px solid #e5e5ea' }}>
                              {copiedId === link.id ? 'Copied!' : 'Copy link'}
                            </button>
                            <button onClick={() => { setFilterLinkId(link.id); setTab('submissions'); loadSubmissions() }} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: '#f0f0f2', color: '#111111', border: '1px solid #e5e5ea' }}>
                              Submissions
                            </button>
                            <button onClick={() => startEdit(link)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: '#f0f0f2', color: '#111111', border: '1px solid #e5e5ea' }}>
                              Edit
                            </button>
                            <button onClick={() => setConfirmDelete(link)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
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

        {/* Submissions tab */}
        {tab === 'submissions' && (
          <>
            <div className="flex items-center gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest mr-2" style={{ color: '#6e6e73' }}>Filter by link</label>
                <select value={filterLinkId} onChange={e => setFilterLinkId(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none"
                  style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
                  <option value="all">All links</option>
                  {links.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>
              <div className="flex-1" />
              <button onClick={exportCSV} disabled={filteredSubmissions.length === 0}
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
                        <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ background: '#f5f5f7' }}>
                    {filteredSubmissions.map((sub, i) => (
                      <tr key={sub.id} style={{ borderBottom: i < filteredSubmissions.length - 1 ? '1px solid #f0f0f2' : 'none' }}>
                        <td className="px-5 py-3 whitespace-nowrap" style={{ color: '#6e6e73' }}>{fmtDateTime(sub.submittedAt)}</td>
                        <td className="px-5 py-3 font-medium text-gray-900">{sub.userName}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{sub.userEmail}</td>
                        <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{sub.userPhone ?? '—'}</td>
                        <td className="px-5 py-3">
                          {sub.instagramUsername ? (
                            <a href={`https://instagram.com/${sub.instagramUsername}`} target="_blank" rel="noopener noreferrer" className="font-medium" style={{ color: '#111111' }}>@{sub.instagramUsername}</a>
                          ) : <span style={{ color: '#6e6e73' }}>—</span>}
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

      {/* Delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="rounded-2xl p-8 w-full max-w-sm text-center" style={{ background: '#ffffff', border: '1px solid #e5e5ea' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#fee2e2' }}>
              <span className="text-xl">🗑</span>
            </div>
            <h2 className="text-sm font-bold text-gray-900 mb-2">Delete this link?</h2>
            <p className="text-xs leading-relaxed mb-2" style={{ color: '#6e6e73' }}>"{confirmDelete.title}" will be permanently deleted.</p>
            <p className="text-xs leading-relaxed mb-6" style={{ color: '#dc2626' }}>Existing submissions will not be deleted, but the link will stop working.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-lg text-xs font-medium" style={{ background: '#f0f0f2', color: '#6e6e73', border: '1px solid #e5e5ea' }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-lg text-xs font-semibold" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
