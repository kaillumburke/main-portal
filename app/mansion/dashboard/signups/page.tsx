'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, Timestamp
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'

// ─── Block types ──────────────────────────────────────────────────────────────

type BlockType = 'header' | 'image' | 'text' | 'button' | 'divider' | 'spacer'
type Align = 'left' | 'center' | 'right'

interface HeaderBlock  { id: string; type: 'header';  bgColor: string; logoSrc: string; logoAlt: string; logoWidth: number; align: Align; title: string; subtitle: string; textColor: string; padding: number }
interface ImageBlock   { id: string; type: 'image';   bgColor: string; src: string; alt: string; link: string; width: number; align: Align; padding: number; borderRadius: number }
interface TextBlock    { id: string; type: 'text';    bgColor: string; content: string; fontFamily: string; padding: number }
interface ButtonBlock  { id: string; type: 'button';  bgColor: string; text: string; url: string; buttonBg: string; textColor: string; fontSize: number; paddingV: number; paddingH: number; borderRadius: number; align: Align; fullWidth: boolean }
interface DividerBlock { id: string; type: 'divider'; bgColor: string; color: string; height: number; marginV: number }
interface SpacerBlock  { id: string; type: 'spacer';  bgColor: string; height: number }

type EmailBlock = HeaderBlock | ImageBlock | TextBlock | ButtonBlock | DividerBlock | SpacerBlock

export interface EmailConfig {
  enabled: boolean
  subject: string
  preheader: string
  emailBgColor: string
  contentBgColor: string
  fontFamily: string
  blocks: EmailBlock[]
  sendAt?: string
}

// ─── Other types ──────────────────────────────────────────────────────────────

type FontFamily = 'sans-serif' | 'serif' | 'display'

interface SignUpLink {
  id: string; slug: string; title: string; description: string
  mainImageURL?: string; backgroundImageURL?: string; backgroundColorHex: string
  textColorHex: string; fontFamily: FontFamily; appStoreURL: string; active: boolean
  createdAt: Timestamp; submissionCount: number
  scheduledStartAt?: Timestamp; scheduledEndAt?: Timestamp
  senderName?: string
  confirmationEmail?: EmailConfig; followUp1?: EmailConfig; followUp2?: EmailConfig
  emailSubject?: string; emailBody?: string
  followUp1Subject?: string; followUp1Body?: string; followUp1SendAt?: Timestamp
  followUp2Subject?: string; followUp2Body?: string; followUp2SendAt?: Timestamp
}

interface Submission {
  id: string; linkId: string; linkTitle: string; userId: string
  userName: string; userEmail: string; userPhone?: string
  instagramUsername?: string; submittedAt: Timestamp
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PUBLIC_BASE = 'https://mansion-nightclub-liverpool.web.app'

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60)
}
function fmtDate(ts?: Timestamp) {
  if (!ts) return '—'
  return new Date(ts.seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(ts?: Timestamp) {
  if (!ts) return '—'
  const d = new Date(ts.seconds * 1000)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function uid() { return Math.random().toString(36).slice(2) }

// ─── Block defaults ───────────────────────────────────────────────────────────

function defaultBlock(type: BlockType): EmailBlock {
  switch (type) {
    case 'header':  return { id: uid(), type, bgColor: '#111111', logoSrc: '', logoAlt: '', logoWidth: 140, align: 'center', title: 'Mansion Liverpool', subtitle: '', textColor: '#ffffff', padding: 32 }
    case 'image':   return { id: uid(), type, bgColor: '#ffffff', src: '', alt: '', link: '', width: 100, align: 'center', padding: 0, borderRadius: 0 }
    case 'text':    return { id: uid(), type, bgColor: '#ffffff', content: '<p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#111111">Hi {{name}},</p><p style="margin:0;font-size:16px;line-height:1.7;color:#111111">Thanks for signing up! We\'ll be in touch soon.</p>', fontFamily: 'Arial', padding: 32 }
    case 'button':  return { id: uid(), type, bgColor: '#ffffff', text: 'Get tickets', url: '', buttonBg: '#111111', textColor: '#ffffff', fontSize: 15, paddingV: 14, paddingH: 32, borderRadius: 8, align: 'center', fullWidth: false }
    case 'divider': return { id: uid(), type, bgColor: '#ffffff', color: '#e5e5ea', height: 1, marginV: 16 }
    case 'spacer':  return { id: uid(), type, bgColor: '#ffffff', height: 32 }
  }
}

// ─── HTML generation ──────────────────────────────────────────────────────────

function blockToHTML(block: EmailBlock): string {
  switch (block.type) {
    case 'header': return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${block.bgColor}">
<tr><td align="${block.align}" style="padding:${block.padding}px 32px">
${block.logoSrc ? `<img src="${block.logoSrc}" alt="${block.logoAlt}" width="${block.logoWidth}" style="display:block;${block.align === 'center' ? 'margin:0 auto;' : ''}max-width:${block.logoWidth}px;height:auto">` : ''}
${block.title ? `<div style="color:${block.textColor};font-size:22px;font-weight:700;margin-top:${block.logoSrc ? 12 : 0}px;${block.align === 'center' ? 'text-align:center;' : ''}">${block.title}</div>` : ''}
${block.subtitle ? `<div style="color:${block.textColor};font-size:14px;opacity:0.75;margin-top:4px;${block.align === 'center' ? 'text-align:center;' : ''}">${block.subtitle}</div>` : ''}
</td></tr></table>`
    case 'image': return block.src ? `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${block.bgColor}">
<tr><td align="${block.align}" style="padding:${block.padding}px">
${block.link ? `<a href="${block.link}">` : ''}<img src="${block.src}" alt="${block.alt}" style="display:block;max-width:${block.width}%;height:auto;border-radius:${block.borderRadius}px;${block.align === 'center' ? 'margin:0 auto;' : ''}">${block.link ? '</a>' : ''}
</td></tr></table>` : ''
    case 'text': return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${block.bgColor}">
<tr><td style="padding:${block.padding}px;font-family:${block.fontFamily},Arial,sans-serif">${block.content}</td></tr></table>`
    case 'button': return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${block.bgColor}">
<tr><td align="${block.align}" style="padding:20px 32px">
<table cellpadding="0" cellspacing="0" border="0"${block.fullWidth ? ' width="100%"' : ''}><tr>
<td style="background:${block.buttonBg};border-radius:${block.borderRadius}px;text-align:center">
<a href="${block.url || '#'}" style="display:${block.fullWidth ? 'block' : 'inline-block'};padding:${block.paddingV}px ${block.paddingH}px;color:${block.textColor};font-size:${block.fontSize}px;font-weight:600;text-decoration:none">${block.text || 'Click here'}</a>
</td></tr></table></td></tr></table>`
    case 'divider': return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${block.bgColor}">
<tr><td style="padding:${block.marginV}px 32px"><div style="height:${block.height}px;background:${block.color}"></div></td></tr></table>`
    case 'spacer': return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${block.bgColor}">
<tr><td style="height:${block.height}px;font-size:1px;line-height:1px">&nbsp;</td></tr></table>`
    default: return ''
  }
}

export function generateEmailHTML(cfg: EmailConfig, name = '{{name}}'): string {
  const html = cfg.blocks.map(b => blockToHTML(b)).join('\n').replace(/\{\{name\}\}/g, name)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.subject || 'Email'}</title></head>
<body style="margin:0;padding:0;background:${cfg.emailBgColor};font-family:${cfg.fontFamily},Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${cfg.emailBgColor}">
<tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${cfg.contentBgColor}">
${html}
</table></td></tr></table></body></html>`
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const emptyEmailConfig: EmailConfig = {
  enabled: false, subject: '', preheader: '',
  emailBgColor: '#f5f5f7', contentBgColor: '#ffffff',
  fontFamily: 'Arial', blocks: [],
}

const emptyForm = {
  title: '', description: '', slug: '',
  mainImageURL: '', backgroundImageURL: '',
  backgroundColorHex: '#0a0a0a', textColorHex: '#ffffff',
  fontFamily: 'sans-serif' as FontFamily,
  appStoreURL: 'https://apps.apple.com/gb/app/mansion-liverpool/id6742553975',
  active: true, scheduledStartAt: '', scheduledEndAt: '', senderName: '',
  confirmationEmail: { ...emptyEmailConfig },
  followUp1: { ...emptyEmailConfig, sendAt: '' },
  followUp2: { ...emptyEmailConfig, sendAt: '' },
}

// ─── Block canvas (single block in editor) ────────────────────────────────────

function BlockInCanvas({ block, selected, total, index, onSelect, onDelete, onDuplicate, onMoveUp, onMoveDown, onUpdate, uploadImg }: {
  block: EmailBlock; selected: boolean; total: number; index: number
  onSelect: () => void; onDelete: () => void; onDuplicate: () => void
  onMoveUp: () => void; onMoveDown: () => void; onUpdate: (b: EmailBlock) => void
  uploadImg: (file: File, path: string) => Promise<string>
}) {
  const [hovered, setHovered] = useState(false)

  const inner = (() => {
    switch (block.type) {
      case 'header': return (
        <div style={{ background: block.bgColor, padding: block.padding, textAlign: block.align as any }}>
          {block.logoSrc && <img src={block.logoSrc} alt={block.logoAlt} style={{ maxWidth: block.logoWidth, height: 'auto', display: 'block', margin: block.align === 'center' ? '0 auto' : undefined }} />}
          {block.title && <div style={{ color: block.textColor, fontSize: 22, fontWeight: 700, marginTop: block.logoSrc ? 12 : 0 }}>{block.title}</div>}
          {block.subtitle && <div style={{ color: block.textColor, fontSize: 13, opacity: 0.75, marginTop: 4 }}>{block.subtitle}</div>}
        </div>
      )
      case 'image': return (
        <div style={{ background: block.bgColor, padding: block.padding, textAlign: block.align as any }}>
          {block.src ? <img src={block.src} alt={block.alt} style={{ maxWidth: `${block.width}%`, height: 'auto', display: 'block', margin: block.align === 'center' ? '0 auto' : undefined, borderRadius: block.borderRadius }} />
            : <div style={{ height: 120, background: '#f0f0f2', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, color: '#6e6e73', fontSize: 12 }}>Click to add image</div>}
        </div>
      )
      case 'text': return (
        <div style={{ background: block.bgColor, padding: block.padding, fontFamily: `${block.fontFamily}, Arial, sans-serif` }}
          dangerouslySetInnerHTML={{ __html: block.content }} />
      )
      case 'button': return (
        <div style={{ background: block.bgColor, padding: '20px 32px', textAlign: block.align as any }}>
          <span style={{ display: block.fullWidth ? 'block' : 'inline-block', background: block.buttonBg, color: block.textColor, padding: `${block.paddingV}px ${block.paddingH}px`, borderRadius: block.borderRadius, fontSize: block.fontSize, fontWeight: 600, cursor: 'pointer' }}>
            {block.text || 'Click here'}
          </span>
        </div>
      )
      case 'divider': return (
        <div style={{ background: block.bgColor, padding: `${block.marginV}px 32px` }}>
          <div style={{ height: block.height, background: block.color }} />
        </div>
      )
      case 'spacer': return <div style={{ background: block.bgColor, height: block.height }} />
    }
  })()

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      style={{ position: 'relative', cursor: 'pointer', outline: selected ? '2px solid #111111' : hovered ? '2px solid #d0d0d5' : '2px solid transparent', outlineOffset: -2 }}>
      {inner}
      {(hovered || selected) && (
        <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2, zIndex: 10 }} onClick={e => e.stopPropagation()}>
          {index > 0 && <button onClick={onMoveUp} style={btnStyle}>↑</button>}
          {index < total - 1 && <button onClick={onMoveDown} style={btnStyle}>↓</button>}
          <button onClick={onDuplicate} style={btnStyle}>⧉</button>
          <button onClick={onDelete} style={{ ...btnStyle, background: '#fee2e2', color: '#dc2626' }}>✕</button>
        </div>
      )}
      {selected && (
        <div style={{ position: 'absolute', top: 4, left: 4, background: '#111111', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
          {block.type}
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.95)', border: '1px solid #e5e5ea', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer', color: '#111' }

// Stable module-level helpers — must NOT be defined inside components or focus is lost each keystroke
function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6e6e73', marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  )
}

const settingsInpStyle: React.CSSProperties = { width: '100%', background: '#f5f5f7', border: '1px solid #e5e5ea', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: '#111', outline: 'none', boxSizing: 'border-box' }

// ─── Block settings panel ─────────────────────────────────────────────────────

function BlockSettings({ block, onUpdate, uploadImg }: {
  block: EmailBlock
  onUpdate: (b: EmailBlock) => void
  uploadImg: (f: File, p: string) => Promise<string>
}) {
  const [uploading, setUploading] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  const set = (key: string, val: unknown) => onUpdate({ ...block, [key]: val } as EmailBlock)

  const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} style={{ ...settingsInpStyle, ...props.style }} />
  )

  const colorRow = (label: string, key: string) => (
    <SettingsField label={label}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" value={(block as any)[key]} onChange={e => set(key, e.target.value)} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #e5e5ea', padding: 2, cursor: 'pointer', flexShrink: 0 }} />
        {inp({ type: 'text', value: (block as any)[key], onChange: e => set(key, e.target.value), style: { fontFamily: 'monospace', fontSize: 11 } })}
      </div>
    </SettingsField>
  )

  const alignRow = (key: string) => (
    <SettingsField label="Alignment">
      <div style={{ display: 'flex', gap: 4 }}>
        {(['left', 'center', 'right'] as Align[]).map(a => (
          <button key={a} onClick={() => set(key, a)}
            style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: `1px solid ${(block as any)[key] === a ? '#111111' : '#e5e5ea'}`, background: (block as any)[key] === a ? '#111111' : '#f5f5f7', color: (block as any)[key] === a ? '#fff' : '#6e6e73', fontSize: 11, cursor: 'pointer' }}>
            {a === 'left' ? '⬅' : a === 'center' ? '⬛' : '➡'}
          </button>
        ))}
      </div>
    </SettingsField>
  )

  const uploadField = (label: string, key: string, ref: React.RefObject<HTMLInputElement | null>, pathPrefix: string) => (
    <SettingsField label={label}>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0]
          if (!f) return
          setUploading(true)
          try { set(key, await uploadImg(f, `${pathPrefix}/${uid()}.${f.name.split('.').pop()}`)) }
          finally { setUploading(false) }
        }} />
      <div style={{ display: 'flex', gap: 6 }}>
        {inp({ type: 'url', value: (block as any)[key] ?? '', onChange: e => set(key, e.target.value), placeholder: 'Paste URL or upload…', style: { fontSize: 11 } })}
        <button onClick={() => ref.current?.click()} style={{ padding: '6px 10px', background: '#f0f0f2', border: '1px solid #e5e5ea', borderRadius: 6, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {uploading ? '…' : '↑'}
        </button>
      </div>
      {(block as any)[key] && <img src={(block as any)[key]} style={{ marginTop: 8, width: '100%', borderRadius: 6, maxHeight: 80, objectFit: 'cover' }} alt="" />}
    </SettingsField>
  )

  const numField = (label: string, key: string, min = 0, max = 600) => (
    <SettingsField label={label}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {inp({ type: 'number', value: (block as any)[key], min, max, onChange: e => set(key, Number(e.target.value)), style: { width: 70 } })}
        <input type="range" value={(block as any)[key]} min={min} max={max} onChange={e => set(key, Number(e.target.value))} style={{ flex: 1 }} />
      </div>
    </SettingsField>
  )

  if (block.type === 'header') return (
    <div>
      {colorRow('Background', 'bgColor')}
      {colorRow('Text colour', 'textColor')}
      {uploadField('Logo image', 'logoSrc', logoRef, 'email-logos')}
      <SettingsField label="Logo width (px)">{inp({ type: 'number', value: block.logoWidth, min: 40, max: 400, onChange: e => set('logoWidth', Number(e.target.value)) })}</SettingsField>
      {alignRow('align')}
      <SettingsField label="Title">{inp({ type: 'text', value: block.title, onChange: e => set('title', e.target.value) })}</SettingsField>
      <SettingsField label="Subtitle">{inp({ type: 'text', value: block.subtitle, onChange: e => set('subtitle', e.target.value) })}</SettingsField>
      {numField('Padding', 'padding', 8, 80)}
    </div>
  )

  if (block.type === 'image') return (
    <div>
      {uploadField('Image', 'src', imgRef, 'email-images')}
      <SettingsField label="Alt text">{inp({ type: 'text', value: block.alt, onChange: e => set('alt', e.target.value) })}</SettingsField>
      <SettingsField label="Link URL">{inp({ type: 'url', value: block.link, onChange: e => set('link', e.target.value), placeholder: 'https://…' })}</SettingsField>
      {numField('Width (%)', 'width', 10, 100)}
      {numField('Border radius', 'borderRadius', 0, 40)}
      {numField('Padding', 'padding', 0, 60)}
      {alignRow('align')}
      {colorRow('Background', 'bgColor')}
    </div>
  )

  if (block.type === 'text') return (
    <div>
      <SettingsField label="Content">
        <textarea
          value={block.content}
          onChange={e => set('content', e.target.value)}
          rows={8}
          style={{ width: '100%', background: '#f5f5f7', border: '1px solid #e5e5ea', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#111', outline: 'none', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }}
        />
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>HTML accepted · use {'{{name}}'} for recipient</div>
      </SettingsField>
      <SettingsField label="Font">
        <select value={block.fontFamily} onChange={e => set('fontFamily', e.target.value)} style={{ width: '100%', background: '#f5f5f7', border: '1px solid #e5e5ea', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: '#111', outline: 'none' }}>
          {['Arial', 'Georgia', 'Trebuchet MS', 'Courier New', 'Verdana'].map(f => <option key={f}>{f}</option>)}
        </select>
      </SettingsField>
      {numField('Padding', 'padding', 0, 80)}
      {colorRow('Background', 'bgColor')}
    </div>
  )

  if (block.type === 'button') return (
    <div>
      <SettingsField label="Button text">{inp({ type: 'text', value: block.text, onChange: e => set('text', e.target.value) })}</SettingsField>
      <SettingsField label="Link URL">{inp({ type: 'url', value: block.url, onChange: e => set('url', e.target.value), placeholder: 'https://…' })}</SettingsField>
      {colorRow('Button colour', 'buttonBg')}
      {colorRow('Text colour', 'textColor')}
      {colorRow('Section background', 'bgColor')}
      {numField('Font size', 'fontSize', 10, 24)}
      {numField('Vertical padding', 'paddingV', 6, 40)}
      {numField('Horizontal padding', 'paddingH', 8, 80)}
      {numField('Border radius', 'borderRadius', 0, 40)}
      {alignRow('align')}
      <SettingsField label="Full width">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={block.fullWidth} onChange={e => set('fullWidth', e.target.checked)} />
          <span style={{ fontSize: 12, color: '#111' }}>Stretch button to full width</span>
        </label>
      </SettingsField>
    </div>
  )

  if (block.type === 'divider') return (
    <div>
      {colorRow('Line colour', 'color')}
      {colorRow('Background', 'bgColor')}
      {numField('Line thickness', 'height', 1, 8)}
      {numField('Vertical margin', 'marginV', 0, 60)}
    </div>
  )

  if (block.type === 'spacer') return (
    <div>
      {numField('Height', 'height', 8, 120)}
      {colorRow('Background', 'bgColor')}
    </div>
  )

  return null
}

// ─── Add-block button between blocks ─────────────────────────────────────────

function InsertButton({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false)
  const blocks: { type: BlockType; icon: string; label: string }[] = [
    { type: 'header', icon: '▬', label: 'Header' },
    { type: 'image', icon: '🖼', label: 'Image' },
    { type: 'text', icon: 'T', label: 'Text' },
    { type: 'button', icon: '⬛', label: 'Button' },
    { type: 'divider', icon: '—', label: 'Divider' },
    { type: 'spacer', icon: '↕', label: 'Spacer' },
  ]
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: open ? '#111111' : '#e5e5ea', color: open ? '#fff' : '#6e6e73', border: 'none', borderRadius: 12, width: 24, height: 24, fontSize: 14, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        +
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 28, zIndex: 20, background: '#fff', border: '1px solid #e5e5ea', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'flex', gap: 4 }}>
          {blocks.map(b => (
            <button key={b.type} onClick={() => { onAdd(b.type); setOpen(false) }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 10px', border: '1px solid #e5e5ea', borderRadius: 8, background: '#fafafa', cursor: 'pointer', fontSize: 10, color: '#111', minWidth: 52 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f0f0f2' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fafafa' }}>
              <span style={{ fontSize: 16 }}>{b.icon}</span>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Full-screen email builder modal ─────────────────────────────────────────

const BLOCK_PALETTE: { type: BlockType; icon: string; label: string }[] = [
  { type: 'header', icon: '▬', label: 'Header' },
  { type: 'image', icon: '🖼', label: 'Image' },
  { type: 'text', icon: 'T', label: 'Text' },
  { type: 'button', icon: '⬛', label: 'Button' },
  { type: 'divider', icon: '—', label: 'Divider' },
  { type: 'spacer', icon: '↕', label: 'Spacer' },
]

function EmailBuilderModal({ label, config, onChange, showSendAt, uploadImg, onClose }: {
  label: string
  config: EmailConfig
  onChange: (c: EmailConfig) => void
  showSendAt?: boolean
  uploadImg: (f: File, p: string) => Promise<string>
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [leftTab, setLeftTab] = useState<'blocks' | 'settings'>('blocks')
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop')
  const [livePreview, setLivePreview] = useState(false)

  const cfg = config
  const setBlocks = (blocks: EmailBlock[]) => onChange({ ...cfg, blocks })
  const updateBlock = (id: string, updates: Partial<EmailBlock>) =>
    setBlocks(cfg.blocks.map(b => b.id === id ? { ...b, ...updates } as EmailBlock : b))

  const addBlock = (type: BlockType, atIndex?: number) => {
    const nb = defaultBlock(type)
    const blocks = [...cfg.blocks]
    blocks.splice(atIndex ?? blocks.length, 0, nb)
    setBlocks(blocks)
    setSelectedId(nb.id)
  }

  const deleteBlock = (id: string) => { setBlocks(cfg.blocks.filter(b => b.id !== id)); setSelectedId(null) }
  const duplicateBlock = (id: string) => {
    const idx = cfg.blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    const nb = { ...cfg.blocks[idx], id: uid() }
    const blocks = [...cfg.blocks]; blocks.splice(idx + 1, 0, nb)
    setBlocks(blocks); setSelectedId(nb.id)
  }
  const moveBlock = (from: number, to: number) => {
    if (to < 0 || to >= cfg.blocks.length) return
    const blocks = [...cfg.blocks]; const [item] = blocks.splice(from, 1); blocks.splice(to, 0, item)
    setBlocks(blocks)
  }

  const selectedBlock = cfg.blocks.find(b => b.id === selectedId) ?? null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', background: '#1e1e24' }}>

      {/* Top bar */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: '#111118', borderBottom: '1px solid #2a2a35', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>← Back</button>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{label}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['desktop', 'mobile'] as const).map(m => (
            <button key={m} onClick={() => setPreview(m)}
              style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: preview === m ? '#111111' : 'transparent', color: preview === m ? '#fff' : '#aaa', fontSize: 12, cursor: 'pointer' }}>
              {m === 'desktop' ? '🖥 Desktop' : '📱 Mobile'}
            </button>
          ))}
          <button onClick={() => setLivePreview(l => !l)}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: livePreview ? '#16a34a' : 'transparent', color: livePreview ? '#fff' : '#aaa', fontSize: 12, cursor: 'pointer', marginLeft: 8 }}>
            {livePreview ? '● Live' : '○ Live'}
          </button>
        </div>
        <button onClick={onClose}
          style={{ padding: '7px 20px', borderRadius: 8, background: '#111111', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Done
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left sidebar */}
        <div style={{ width: 200, background: '#16161e', borderRight: '1px solid #2a2a35', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #2a2a35' }}>
            {(['blocks', 'settings'] as const).map(t => (
              <button key={t} onClick={() => setLeftTab(t)}
                style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: leftTab === t ? '2px solid #111111' : '2px solid transparent', color: leftTab === t ? '#fff' : '#888', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {leftTab === 'blocks' && (
              <>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Add content</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {BLOCK_PALETTE.map(b => (
                    <button key={b.type} onClick={() => addBlock(b.type)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', border: '1px solid #2a2a35', borderRadius: 8, background: '#1e1e2a', color: '#ccc', fontSize: 10, cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2a3a'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#111111' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1e1e2a'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a35' }}>
                      <span style={{ fontSize: 20 }}>{b.icon}</span>
                      {b.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {leftTab === 'settings' && (
              <div>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email settings</div>
                {[
                  { label: 'Subject line', key: 'subject', type: 'text', placeholder: 'e.g. You\'re on the list 🎉' },
                  { label: 'Preheader', key: 'preheader', type: 'text', placeholder: 'Short preview text…' },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{f.label}</div>
                    <input type={f.type} value={(cfg as any)[f.key]} onChange={e => onChange({ ...cfg, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      style={{ width: '100%', background: '#1e1e2a', border: '1px solid #2a2a35', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                {showSendAt && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Send date & time</div>
                    <input type="datetime-local" value={(cfg as any).sendAt ?? ''}
                      onChange={e => onChange({ ...cfg, sendAt: e.target.value })}
                      style={{ width: '100%', background: '#1e1e2a', border: '1px solid #2a2a35', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#fff', outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#666', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Design</div>
                {[
                  { label: 'Email background', key: 'emailBgColor' },
                  { label: 'Content background', key: 'contentBgColor' },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{f.label}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="color" value={(cfg as any)[f.key]} onChange={e => onChange({ ...cfg, [f.key]: e.target.value })}
                        style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #2a2a35', padding: 1, cursor: 'pointer', flexShrink: 0, background: 'none' }} />
                      <input type="text" value={(cfg as any)[f.key]} onChange={e => onChange({ ...cfg, [f.key]: e.target.value })}
                        style={{ flex: 1, background: '#1e1e2a', border: '1px solid #2a2a35', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: '#fff', outline: 'none', fontFamily: 'monospace' }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Font family</div>
                  <select value={cfg.fontFamily} onChange={e => onChange({ ...cfg, fontFamily: e.target.value })}
                    style={{ width: '100%', background: '#1e1e2a', border: '1px solid #2a2a35', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#fff', outline: 'none' }}>
                    {['Arial', 'Georgia', 'Trebuchet MS', 'Courier New', 'Verdana'].map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center canvas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', background: '#2a2a35' }} onClick={() => setSelectedId(null)}>
          {livePreview ? (
            <div style={{ maxWidth: preview === 'mobile' ? 390 : 660, margin: '0 auto' }}>
              <iframe
                srcDoc={generateEmailHTML(cfg, 'Alex')}
                style={{ width: '100%', height: 800, border: 'none', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
                title="Preview" />
            </div>
          ) : (
            <div style={{ maxWidth: preview === 'mobile' ? 390 : 660, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
              {/* Email shell */}
              <div style={{ background: cfg.emailBgColor, padding: 16, borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
                <div style={{ background: cfg.contentBgColor, fontFamily: `${cfg.fontFamily}, Arial, sans-serif` }}>
                  <InsertButton onAdd={type => addBlock(type, 0)} />
                  {cfg.blocks.map((block, i) => (
                    <div key={block.id}>
                      <BlockInCanvas
                        block={block}
                        selected={block.id === selectedId}
                        total={cfg.blocks.length}
                        index={i}
                        onSelect={() => setSelectedId(block.id)}
                        onDelete={() => deleteBlock(block.id)}
                        onDuplicate={() => duplicateBlock(block.id)}
                        onMoveUp={() => moveBlock(i, i - 1)}
                        onMoveDown={() => moveBlock(i, i + 1)}
                        onUpdate={updates => updateBlock(block.id, updates)}
                        uploadImg={uploadImg}
                      />
                      <InsertButton onAdd={type => addBlock(type, i + 1)} />
                    </div>
                  ))}
                  {cfg.blocks.length === 0 && (
                    <div style={{ padding: 60, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>✉</div>
                      Click a block type on the left to start building your email
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right settings panel */}
        <div style={{ width: 264, background: '#fff', borderLeft: '1px solid #e5e5ea', overflowY: 'auto', flexShrink: 0 }}>
          {selectedBlock ? (
            <div>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#111' }}>{selectedBlock.type}</span>
                <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
              <div style={{ padding: 16 }}>
                <BlockSettings block={selectedBlock} onUpdate={b => updateBlock(selectedBlock.id, b)} uploadImg={uploadImg} />
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: '#aaa', marginTop: 60 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>←</div>
              <div style={{ fontSize: 12 }}>Click any block in the canvas to edit its settings</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── EmailBuilder trigger ─────────────────────────────────────────────────────

function EmailBuilder({ label, subLabel, config, onChange, showSendAt, uploadImg }: {
  label: string; subLabel: string; config: EmailConfig
  onChange: (c: EmailConfig) => void; showSendAt?: boolean
  uploadImg: (f: File, p: string) => Promise<string>
}) {
  const [open, setOpen] = useState(false)
  const set = (key: keyof EmailConfig, val: unknown) => onChange({ ...config, [key]: val })

  return (
    <>
      {open && <EmailBuilderModal label={label} config={config} onChange={onChange} showSendAt={showSendAt} uploadImg={uploadImg} onClose={() => setOpen(false)} />}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea', background: '#ffffff' }}>
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-gray-900">{label}</div>
            <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>{subLabel}</div>
          </div>
          <div className="flex items-center gap-3">
            {config.enabled && (
              <button onClick={() => setOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: '#111', color: '#fff', border: '1px solid #111' }}>
                ✏ Edit email
              </button>
            )}
            <button type="button" onClick={() => set('enabled', !config.enabled)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: config.enabled ? '#111' : '#f0f0f2', color: config.enabled ? '#fff' : '#6e6e73', border: `1px solid ${config.enabled ? '#111' : '#e5e5ea'}` }}>
              {config.enabled ? '✓ On' : 'Off'}
            </button>
          </div>
        </div>
        {config.enabled && (
          <div className="px-5 pb-4" style={{ borderTop: '1px solid #f0f0f2' }}>
            <div className="pt-3 flex flex-col gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ color: '#6e6e73' }}>Subject line</label>
                <input type="text" value={config.subject} onChange={e => set('subject', e.target.value)}
                  placeholder="e.g. You're on the list 🎉"
                  className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                  style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
              </div>
              {showSendAt && (
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ color: '#6e6e73' }}>Send date & time</label>
                  <input type="datetime-local" value={(config as any).sendAt ?? ''}
                    onChange={e => set('sendAt' as keyof EmailConfig, e.target.value as any)}
                    className="rounded-lg px-3 py-2 text-xs text-gray-900 outline-none"
                    style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="text-[10px]" style={{ color: '#6e6e73' }}>
                  {config.blocks.length} block{config.blocks.length !== 1 ? 's' : ''} · {config.blocks.filter(b => b.type === 'text').length > 0 ? 'Has text' : 'No text'} · {config.blocks.filter(b => b.type === 'image').length > 0 ? 'Has image' : 'No image'}
                </div>
                <button onClick={() => setOpen(true)}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#111111', color: '#fff' }}>
                  Open builder →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

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
  const [filterLinkId, setFilterLinkId] = useState('all')
  const [confirmDelete, setConfirmDelete] = useState<SignUpLink | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadLinks = async () => {
    setLoadingLinks(true)
    try { const s = await getDocs(query(collection(db, 'signUpLinks'), orderBy('createdAt', 'desc'))); setLinks(s.docs.map(d => ({ id: d.id, ...d.data() } as SignUpLink))) }
    catch { setLinks([]) } finally { setLoadingLinks(false) }
  }
  const loadSubmissions = async () => {
    setLoadingSubmissions(true)
    try { const s = await getDocs(query(collection(db, 'signUpSubmissions'), orderBy('submittedAt', 'desc'))); setSubmissions(s.docs.map(d => ({ id: d.id, ...d.data() } as Submission))) }
    catch { setSubmissions([]) } finally { setLoadingSubmissions(false) }
  }
  useEffect(() => { loadLinks() }, [])
  useEffect(() => { if (tab === 'submissions') loadSubmissions() }, [tab])

  const setField = (key: string, value: unknown) => setForm(p => {
    const u = { ...p, [key]: value }
    if (key === 'title' && !slugManual) u.slug = slugify(value as string)
    return u
  })

  const uploadImage = useCallback((file: File, pathPrefix: string, progressKey: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const storageRef = ref(storage, `${pathPrefix}/${Date.now()}.${file.name.split('.').pop() ?? 'jpg'}`)
      const task = uploadBytesResumable(storageRef, file)
      task.on('state_changed',
        s => setUploadProgress(p => ({ ...p, [progressKey]: Math.round(s.bytesTransferred / s.totalBytes * 100) })),
        reject,
        async () => { setUploadProgress(p => { const n = { ...p }; delete n[progressKey]; return n }); resolve(await getDownloadURL(task.snapshot.ref)) })
    }), [])

  const uploadEmailImg = useCallback((file: File, path: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const storageRef = ref(storage, path)
      const task = uploadBytesResumable(storageRef, file)
      task.on('state_changed', () => {}, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)))
    }), [])

  const legacyToConfig = (subject?: string, body?: string, sendAt?: Timestamp): EmailConfig & { sendAt: string } => ({
    ...emptyEmailConfig,
    enabled: !!(subject?.trim()),
    subject: subject ?? '',
    sendAt: sendAt ? new Date(sendAt.seconds * 1000).toISOString().slice(0, 16) : '',
    blocks: body ? [{ ...defaultBlock('text') as TextBlock, content: body.split('\n').map(l => l ? `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#111">${l}</p>` : '<br>').join('') }] : [],
  })

  const startEdit = (link: SignUpLink) => {
    setEditingId(link.id)
    setForm({
      title: link.title, description: link.description, slug: link.slug,
      mainImageURL: link.mainImageURL ?? '', backgroundImageURL: link.backgroundImageURL ?? '',
      backgroundColorHex: link.backgroundColorHex, textColorHex: link.textColorHex,
      fontFamily: link.fontFamily, appStoreURL: link.appStoreURL, active: link.active,
      scheduledStartAt: link.scheduledStartAt ? new Date(link.scheduledStartAt.seconds * 1000).toISOString().slice(0, 16) : '',
      scheduledEndAt: link.scheduledEndAt ? new Date(link.scheduledEndAt.seconds * 1000).toISOString().slice(0, 16) : '',
      senderName: link.senderName ?? '',
      confirmationEmail: { ...emptyEmailConfig, ...(link.confirmationEmail ?? legacyToConfig(link.emailSubject, link.emailBody)), sendAt: undefined },
      followUp1: { ...emptyEmailConfig, sendAt: '', ...(link.followUp1 ?? legacyToConfig(link.followUp1Subject, link.followUp1Body, link.followUp1SendAt)) },
      followUp2: { ...emptyEmailConfig, sendAt: '', ...(link.followUp2 ?? legacyToConfig(link.followUp2Subject, link.followUp2Body, link.followUp2SendAt)) },
    })
    setSlugManual(true); setMainImagePreview(link.mainImageURL ?? null); setBgImagePreview(link.backgroundImageURL ?? null)
    setMainImageFile(null); setBgImageFile(null); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); setSlugManual(false); setMainImageFile(null); setMainImagePreview(null); setBgImageFile(null); setBgImagePreview(null) }

  const handleSave = async () => {
    if (!form.title || !form.slug) return
    setSaving(true)
    try {
      let mainImageURL = form.mainImageURL, backgroundImageURL = form.backgroundImageURL
      if (mainImageFile) mainImageURL = await uploadImage(mainImageFile, 'signup-main-images', 'main')
      if (bgImageFile) backgroundImageURL = await uploadImage(bgImageFile, 'signup-bg-images', 'bg')
      const toTs = (s: string | undefined) => s ? Timestamp.fromDate(new Date(s)) : null
      const payload = {
        slug: form.slug, title: form.title, description: form.description,
        mainImageURL, backgroundImageURL, backgroundColorHex: form.backgroundColorHex,
        textColorHex: form.textColorHex, fontFamily: form.fontFamily, appStoreURL: form.appStoreURL,
        active: form.active, senderName: form.senderName,
        scheduledStartAt: toTs(form.scheduledStartAt), scheduledEndAt: toTs(form.scheduledEndAt),
        confirmationEmail: form.confirmationEmail,
        followUp1: { ...form.followUp1, sendAt: toTs((form.followUp1 as any).sendAt) },
        followUp2: { ...form.followUp2, sendAt: toTs((form.followUp2 as any).sendAt) },
      }
      if (editingId) await updateDoc(doc(db, 'signUpLinks', editingId), payload)
      else await addDoc(collection(db, 'signUpLinks'), { ...payload, createdAt: Timestamp.now(), submissionCount: 0 })
      closeForm(); loadLinks()
    } catch (err: unknown) { alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => { if (!confirmDelete) return; await deleteDoc(doc(db, 'signUpLinks', confirmDelete.id)); setConfirmDelete(null); loadLinks() }
  const copyLink = (link: SignUpLink) => { navigator.clipboard.writeText(`${PUBLIC_BASE}/s/${link.slug}`).then(() => { setCopiedId(link.id); setTimeout(() => setCopiedId(null), 2000) }) }

  const filteredSubs = filterLinkId === 'all' ? submissions : submissions.filter(s => s.linkId === filterLinkId)
  const exportCSV = () => {
    const rows = filteredSubs.map(s => [fmtDateTime(s.submittedAt), s.userName, s.userEmail, s.userPhone ?? '', s.instagramUsername ? `@${s.instagramUsername}` : '', s.linkTitle])
    const csv = [['Date', 'Name', 'Email', 'Phone', 'Instagram', 'Link'], ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `signups-${Date.now()}.csv`; a.click()
  }

  const ImagePicker = ({ label, file, preview, inputRef, progressKey, onFile, onClear }: { label: string; file: File | null; preview: string | null; inputRef: React.RefObject<HTMLInputElement | null>; progressKey: string; onFile: (f: File) => void; onClear: () => void }) => (
    <div>
      <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>{label}</label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {preview ? (
        <div className="relative rounded-xl overflow-hidden" style={{ height: 120 }}>
          <img src={preview} className="w-full h-full object-cover" alt="" />
          {uploadProgress[progressKey] !== undefined && <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: '#f0f0f2' }}><div className="h-full" style={{ background: '#111', width: `${uploadProgress[progressKey]}%` }} /></div>}
          <div className="absolute inset-0 flex items-end p-2" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.4),transparent 60%)' }}>
            <button type="button" onClick={onClear} className="text-[10px] px-2 py-1 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-xl flex flex-col items-center justify-center gap-2" style={{ height: 90, border: '2px dashed #d0d0d5', background: '#fafafa' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#111')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#d0d0d5')}>
          <span className="text-lg">🖼</span>
          <span className="text-[11px]" style={{ color: '#6e6e73' }}>Click to upload</span>
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f5f7' }}>
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f2', background: '#f5f5f7' }}>
        <div>
          <h1 className="text-base font-bold text-gray-900">Sign Up Links</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>{links.length} link{links.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); if (showForm) closeForm() }} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: '#111', color: '#fff' }}>
          {showForm ? 'Cancel' : '+ New Link'}
        </button>
      </div>

      <div className="p-8 space-y-5">
        {showForm && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
            <div className="px-6 py-3 flex items-center justify-between" style={{ background: '#fff', borderBottom: '1px solid #f0f0f2' }}>
              <span className="text-xs font-semibold text-gray-900">{editingId ? 'Edit Link' : 'New Sign Up Link'}</span>
              <button onClick={closeForm} className="text-xs" style={{ color: '#6e6e73' }}>✕</button>
            </div>
            <div className="p-6 flex flex-col gap-4" style={{ background: '#f5f5f7' }}>

              {/* Basic Info */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: '#fff', border: '1px solid #e5e5ea' }}>
                <div className="pb-2" style={{ borderBottom: '1px solid #f0f0f2' }}><span className="text-[11px] uppercase tracking-widest font-bold text-gray-900">Basic Info</span></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Title</label>
                    <input type="text" value={form.title} onChange={e => setField('title', e.target.value)} placeholder="e.g. Mansion Saturday Nights" className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} /></div>
                  <div><label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Slug</label>
                    <input type="text" value={form.slug} onChange={e => { setSlugManual(true); setField('slug', slugify(e.target.value)) }} placeholder="auto-generated" className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none font-mono" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                    {form.slug && <p className="text-[10px] mt-1" style={{ color: '#6e6e73' }}>{PUBLIC_BASE}/s/{form.slug}</p>}</div>
                  <div className="col-span-2"><label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Description</label>
                    <textarea value={form.description} onChange={e => setField('description', e.target.value)} rows={2} placeholder="Short description" className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none resize-none" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea', fontFamily: 'inherit' }} /></div>
                </div>
              </div>

              {/* Appearance */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: '#fff', border: '1px solid #e5e5ea' }}>
                <div className="pb-2" style={{ borderBottom: '1px solid #f0f0f2' }}><span className="text-[11px] uppercase tracking-widest font-bold text-gray-900">Appearance</span></div>
                <div className="grid grid-cols-2 gap-4">
                  <ImagePicker label="Main Image" file={mainImageFile} preview={mainImagePreview} inputRef={mainImageRef} progressKey="main" onFile={f => { setMainImageFile(f); setMainImagePreview(URL.createObjectURL(f)) }} onClear={() => { setMainImageFile(null); setMainImagePreview(null); setForm(p => ({ ...p, mainImageURL: '' })) }} />
                  <ImagePicker label="Background Image" file={bgImageFile} preview={bgImagePreview} inputRef={bgImageRef} progressKey="bg" onFile={f => { setBgImageFile(f); setBgImagePreview(URL.createObjectURL(f)) }} onClear={() => { setBgImageFile(null); setBgImagePreview(null); setForm(p => ({ ...p, backgroundImageURL: '' })) }} />
                  {[{ label: 'Background Color', key: 'backgroundColorHex' }, { label: 'Text Color', key: 'textColorHex' }].map(f => (
                    <div key={f.key}><label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>{f.label}</label>
                      <div className="flex items-center gap-2"><input type="color" value={(form as any)[f.key]} onChange={e => setField(f.key, e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" style={{ padding: 2 }} /><input type="text" value={(form as any)[f.key]} onChange={e => setField(f.key, e.target.value)} className="flex-1 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none font-mono" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} /></div>
                    </div>
                  ))}
                  <div className="col-span-2"><label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Font</label>
                    <div className="flex gap-2">{(['sans-serif', 'serif', 'display'] as FontFamily[]).map(f => (<button key={f} type="button" onClick={() => setField('fontFamily', f)} className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize" style={{ background: form.fontFamily === f ? '#111' : '#f5f5f7', color: form.fontFamily === f ? '#fff' : '#6e6e73', border: `1px solid ${form.fontFamily === f ? '#111' : '#e5e5ea'}` }}>{f}</button>))}</div>
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: '#fff', border: '1px solid #e5e5ea' }}>
                <div className="pb-2" style={{ borderBottom: '1px solid #f0f0f2' }}><span className="text-[11px] uppercase tracking-widest font-bold text-gray-900">Settings</span></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>App Store URL</label><input type="url" value={form.appStoreURL} onChange={e => setField('appStoreURL', e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} /></div>
                  <div><label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Go Live At</label><input type="datetime-local" value={form.scheduledStartAt} onChange={e => setField('scheduledStartAt', e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} /></div>
                  <div><label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>End At</label><input type="datetime-local" value={form.scheduledEndAt} onChange={e => setField('scheduledEndAt', e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} /></div>
                  <div className="col-span-2 flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: '#6e6e73' }}>Active</span>
                    <button type="button" onClick={() => setField('active', !form.active)} className="w-10 h-6 rounded-full transition-all relative flex-shrink-0" style={{ background: form.active ? '#111' : '#d1d1d6' }}>
                      <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all" style={{ left: form.active ? 22 : 4 }} />
                    </button>
                    <span className="text-xs" style={{ color: '#6e6e73' }}>{form.active ? 'Accepting submissions' : 'Paused'}</span>
                  </div>
                </div>
              </div>

              {/* Emails */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: '#fff', border: '1px solid #e5e5ea' }}>
                <div className="pb-2" style={{ borderBottom: '1px solid #f0f0f2' }}>
                  <div className="text-[11px] uppercase tracking-widest font-bold text-gray-900">Emails</div>
                  <div className="text-[10px] mt-0.5" style={{ color: '#6e6e73' }}>Sent via Resend · From address: hello@connectclub.live</div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#6e6e73' }}>Sender name</label>
                  <input type="text" value={form.senderName} onChange={e => setField('senderName', e.target.value)} placeholder="e.g. Mansion Liverpool" className="w-full rounded-lg px-3 py-2 text-xs text-gray-900 outline-none" style={{ background: '#f5f5f7', border: '1px solid #e5e5ea' }} />
                </div>
                <EmailBuilder label="Confirmation email" subLabel="Sent instantly when someone signs up" config={form.confirmationEmail} onChange={cfg => setForm(p => ({ ...p, confirmationEmail: cfg }))} uploadImg={uploadEmailImg} />
                <EmailBuilder label="Follow-up email 1" subLabel="Sent automatically at your chosen date & time" config={form.followUp1} onChange={cfg => setForm(p => ({ ...p, followUp1: { ...emptyEmailConfig, sendAt: '', ...cfg } }))} showSendAt uploadImg={uploadEmailImg} />
                <EmailBuilder label="Follow-up email 2" subLabel="Sent automatically at your chosen date & time" config={form.followUp2} onChange={cfg => setForm(p => ({ ...p, followUp2: { ...emptyEmailConfig, sendAt: '', ...cfg } }))} showSendAt uploadImg={uploadEmailImg} />
              </div>

              <div className="flex gap-3">
                <button onClick={handleSave} disabled={saving || !form.title || !form.slug} className="px-5 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: '#111', color: '#fff' }}>
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Link'}
                </button>
                <button onClick={closeForm} className="px-5 py-2.5 rounded-lg text-xs font-medium" style={{ background: '#f0f0f2', color: '#6e6e73', border: '1px solid #e5e5ea' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: '#ebebed' }}>
          {(['links', 'submissions'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-5 py-1.5 rounded-md text-xs font-semibold capitalize transition-all" style={{ background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#111' : '#6e6e73', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{t}</button>
          ))}
        </div>

        {tab === 'links' && (
          loadingLinks ? <div className="text-xs" style={{ color: '#6e6e73' }}>Loading…</div> :
          links.length === 0 ? <div className="rounded-xl p-16 text-center" style={{ background: '#fff', border: '1px solid #e5e5ea' }}><div className="text-xs" style={{ color: '#6e6e73' }}>No sign up links yet</div></div> :
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
            <table className="w-full text-xs">
              <thead><tr style={{ background: '#fff', borderBottom: '1px solid #f0f0f2' }}>{['Title', 'Slug', 'Status', 'Submissions', 'Created', ''].map(h => <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>)}</tr></thead>
              <tbody style={{ background: '#f5f5f7' }}>
                {links.map((link, i) => (
                  <tr key={link.id} style={{ borderBottom: i < links.length - 1 ? '1px solid #f0f0f2' : 'none' }}>
                    <td className="px-5 py-3 font-medium text-gray-900">{link.title}</td>
                    <td className="px-5 py-3"><span className="font-mono" style={{ color: '#6e6e73' }}>/s/{link.slug}</span></td>
                    <td className="px-5 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase" style={link.active ? { background: '#f0fdf4', color: '#16a34a' } : { background: '#f5f5f7', color: '#6e6e73' }}>{link.active ? 'Active' : 'Paused'}</span></td>
                    <td className="px-5 py-3 font-medium text-gray-900">{link.submissionCount ?? 0}</td>
                    <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{fmtDate(link.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => copyLink(link)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={copiedId === link.id ? { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' } : { background: '#f0f0f2', color: '#111', border: '1px solid #e5e5ea' }}>{copiedId === link.id ? 'Copied!' : 'Copy link'}</button>
                        <button onClick={() => { setFilterLinkId(link.id); setTab('submissions'); loadSubmissions() }} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: '#f0f0f2', color: '#111', border: '1px solid #e5e5ea' }}>Submissions</button>
                        <button onClick={() => startEdit(link)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: '#f0f0f2', color: '#111', border: '1px solid #e5e5ea' }}>Edit</button>
                        <button onClick={() => setConfirmDelete(link)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'submissions' && (
          <>
            <div className="flex items-center gap-3">
              <div><label className="text-[10px] uppercase tracking-widest mr-2" style={{ color: '#6e6e73' }}>Filter</label>
                <select value={filterLinkId} onChange={e => setFilterLinkId(e.target.value)} className="rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none" style={{ background: '#fff', border: '1px solid #e5e5ea' }}>
                  <option value="all">All links</option>{links.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>
              <div className="flex-1" />
              <button onClick={exportCSV} disabled={filteredSubs.length === 0} className="px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: '#111', color: '#fff' }}>Export CSV</button>
            </div>
            {loadingSubmissions ? <div className="text-xs" style={{ color: '#6e6e73' }}>Loading…</div> :
            filteredSubs.length === 0 ? <div className="rounded-xl p-16 text-center" style={{ background: '#fff', border: '1px solid #e5e5ea' }}><div className="text-xs" style={{ color: '#6e6e73' }}>No submissions yet</div></div> :
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5ea' }}>
              <table className="w-full text-xs">
                <thead><tr style={{ background: '#fff', borderBottom: '1px solid #f0f0f2' }}>{['Date', 'Name', 'Email', 'Phone', 'Instagram', 'Link'].map(h => <th key={h} className="text-left px-5 py-3 font-semibold uppercase tracking-wider" style={{ color: '#6e6e73', fontSize: 10 }}>{h}</th>)}</tr></thead>
                <tbody style={{ background: '#f5f5f7' }}>
                  {filteredSubs.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: i < filteredSubs.length - 1 ? '1px solid #f0f0f2' : 'none' }}>
                      <td className="px-5 py-3 whitespace-nowrap" style={{ color: '#6e6e73' }}>{fmtDateTime(s.submittedAt)}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{s.userName}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{s.userEmail}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{s.userPhone ?? '—'}</td>
                      <td className="px-5 py-3">{s.instagramUsername ? <a href={`https://instagram.com/${s.instagramUsername}`} target="_blank" rel="noopener noreferrer" className="font-medium" style={{ color: '#111' }}>@{s.instagramUsername}</a> : <span style={{ color: '#6e6e73' }}>—</span>}</td>
                      <td className="px-5 py-3" style={{ color: '#6e6e73' }}>{s.linkTitle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="rounded-2xl p-8 w-full max-w-sm text-center" style={{ background: '#fff', border: '1px solid #e5e5ea' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#fee2e2' }}><span className="text-xl">🗑</span></div>
            <h2 className="text-sm font-bold text-gray-900 mb-2">Delete this link?</h2>
            <p className="text-xs mb-6" style={{ color: '#dc2626' }}>This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-lg text-xs font-medium" style={{ background: '#f0f0f2', color: '#6e6e73', border: '1px solid #e5e5ea' }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-lg text-xs font-semibold" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
