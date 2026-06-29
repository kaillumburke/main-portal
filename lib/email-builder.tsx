'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'

// ─── Block types ──────────────────────────────────────────────────────────────

export type BlockType = 'header' | 'image' | 'text' | 'button' | 'divider' | 'spacer'
export type Align = 'left' | 'center' | 'right'

export interface HeaderBlock  { id: string; type: 'header';  bgColor: string; logoSrc: string; logoAlt: string; logoWidth: number; align: Align; title: string; subtitle: string; textColor: string; padding: number; titleFont: string; titleSize: number; titleBold: boolean; titleItalic: boolean; subtitleFont: string; subtitleSize: number; subtitleBold: boolean; subtitleItalic: boolean }
export interface ImageBlock   { id: string; type: 'image';   bgColor: string; src: string; alt: string; link: string; width: number; align: Align; padding: number; borderRadius: number }
export interface TextBlock    { id: string; type: 'text';    bgColor: string; content: string; fontFamily: string; padding: number }
export interface ButtonBlock  { id: string; type: 'button';  bgColor: string; text: string; url: string; buttonBg: string; textColor: string; fontSize: number; paddingV: number; paddingH: number; borderRadius: number; align: Align; fullWidth: boolean }
export interface DividerBlock { id: string; type: 'divider'; bgColor: string; color: string; height: number; marginV: number }
export interface SpacerBlock  { id: string; type: 'spacer';  bgColor: string; height: number }

export type EmailBlock = HeaderBlock | ImageBlock | TextBlock | ButtonBlock | DividerBlock | SpacerBlock

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

export const emptyEmailConfig: EmailConfig = {
  enabled: false, subject: '', preheader: '',
  emailBgColor: '#f5f5f7', contentBgColor: '#ffffff',
  fontFamily: 'Arial', blocks: [],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function uid() { return Math.random().toString(36).slice(2) }

export function defaultBlock(type: BlockType): EmailBlock {
  switch (type) {
    case 'header':  return { id: uid(), type, bgColor: '#111111', logoSrc: '/mansion-logo.png', logoAlt: 'Mansion Liverpool', logoWidth: 140, align: 'center', title: '', subtitle: '', textColor: '#ffffff', padding: 32, titleFont: 'Arial', titleSize: 24, titleBold: true, titleItalic: false, subtitleFont: 'Arial', subtitleSize: 14, subtitleBold: false, subtitleItalic: false }
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
${block.title ? `<div style="color:${block.textColor};font-family:${block.titleFont ?? 'Arial'},Arial,sans-serif;font-size:${block.titleSize ?? 24}px;font-weight:${block.titleBold ? '700' : '400'};font-style:${block.titleItalic ? 'italic' : 'normal'};margin-top:${block.logoSrc ? 12 : 0}px;${block.align === 'center' ? 'text-align:center;' : ''}">${block.title}</div>` : ''}
${block.subtitle ? `<div style="color:${block.textColor};font-family:${block.subtitleFont ?? 'Arial'},Arial,sans-serif;font-size:${block.subtitleSize ?? 14}px;font-weight:${block.subtitleBold ? '700' : '400'};font-style:${block.subtitleItalic ? 'italic' : 'normal'};opacity:0.75;margin-top:4px;${block.align === 'center' ? 'text-align:center;' : ''}">${block.subtitle}</div>` : ''}
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

export function generateEmailHTML(cfg: EmailConfig, name = '{{name}}', email = '', instagram = ''): string {
  const html = cfg.blocks.map(b => blockToHTML(b)).join('\n')
    .replace(/\{\{name\}\}/g, name || '{{name}}')
    .replace(/\{\{email\}\}/g, email || '{{email}}')
    .replace(/\{\{instagram\}\}/g, instagram ? `@${instagram}` : '{{instagram}}')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.subject || 'Email'}</title></head>
<body style="margin:0;padding:0;background:${cfg.emailBgColor};font-family:${cfg.fontFamily},Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${cfg.emailBgColor}">
<tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${cfg.contentBgColor}">
${html}
</table></td></tr></table></body></html>`
}

// ─── Upload helper ────────────────────────────────────────────────────────────

export function useUploadEmailImg() {
  return useCallback((file: File, path: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const storageRef = ref(storage, path)
      const task = uploadBytesResumable(storageRef, file)
      task.on('state_changed', () => {}, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)))
    }), [])
}

// ─── Stable helpers (must be module-level to preserve focus) ─────────────────

const btnStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.95)', border: '1px solid #e5e5ea', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer', color: '#111' }
const FONTS = ['Arial', 'Georgia', 'Trebuchet MS', 'Courier New', 'Verdana']
const settingsInpStyle: React.CSSProperties = { width: '100%', background: '#f5f5f7', border: '1px solid #e5e5ea', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: '#111', outline: 'none', boxSizing: 'border-box' }

export function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6e6e73', marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  )
}

export function TypographyRow({ font, size, bold, italic, onFont, onSize, onBold, onItalic }: {
  font: string; size: number; bold: boolean; italic: boolean
  onFont: (v: string) => void; onSize: (v: number) => void
  onBold: (v: boolean) => void; onItalic: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
      <select value={font} onChange={e => onFont(e.target.value)}
        style={{ flex: 1, background: '#f5f5f7', border: '1px solid #e5e5ea', borderRadius: 6, padding: '5px 6px', fontSize: 11, color: '#111', outline: 'none' }}>
        {FONTS.map(f => <option key={f}>{f}</option>)}
      </select>
      <input type="number" value={size} min={8} max={72} onChange={e => onSize(Number(e.target.value))}
        style={{ width: 48, background: '#f5f5f7', border: '1px solid #e5e5ea', borderRadius: 6, padding: '5px 6px', fontSize: 11, color: '#111', outline: 'none', textAlign: 'center' }} />
      <button onClick={() => onBold(!bold)}
        style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${bold ? '#111' : '#e5e5ea'}`, background: bold ? '#111' : '#f5f5f7', color: bold ? '#fff' : '#6e6e73', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>B</button>
      <button onClick={() => onItalic(!italic)}
        style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${italic ? '#111' : '#e5e5ea'}`, background: italic ? '#111' : '#f5f5f7', color: italic ? '#fff' : '#6e6e73', fontStyle: 'italic', fontSize: 13, cursor: 'pointer' }}>I</button>
    </div>
  )
}

// ─── Crop modal ───────────────────────────────────────────────────────────────

type CropRect = { x: number; y: number; w: number; h: number }
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null

export function ImageCropModal({ src, onConfirm, onClose, uploadImg }: {
  src: string; onConfirm: (url: string) => void; onClose: () => void
  uploadImg: (f: File, p: string) => Promise<string>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 })
  const [crop, setCrop] = useState<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const [dragging, setDragging] = useState<DragMode>(null)
  const dragStart = useRef<{ mx: number; my: number; crop: CropRect } | null>(null)
  const [saving, setSaving] = useState(false)
  const [cursor, setCursor] = useState('default')

  useEffect(() => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImgEl(img)
      const maxW = Math.min(700, window.innerWidth - 80), maxH = window.innerHeight - 220
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
      setDisplaySize({ w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) })
    }
    img.src = src
  }, [src])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgEl || displaySize.w === 0) return
    canvas.width = displaySize.w; canvas.height = displaySize.h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(imgEl, 0, 0, displaySize.w, displaySize.h)
    const cx = crop.x * displaySize.w, cy = crop.y * displaySize.h
    const cw = crop.w * displaySize.w, ch = crop.h * displaySize.h
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, displaySize.w, displaySize.h)
    ctx.clearRect(cx, cy, cw, ch); ctx.drawImage(imgEl, cx, cy, cw, ch, cx, cy, cw, ch)
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(cx, cy, cw, ch)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(cx + cw * i / 3, cy); ctx.lineTo(cx + cw * i / 3, cy + ch); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx, cy + ch * i / 3); ctx.lineTo(cx + cw, cy + ch * i / 3); ctx.stroke()
    }
    const hs = 8; ctx.fillStyle = '#fff'
    for (const [hx, hy] of [[cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch]])
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
  }, [imgEl, displaySize, crop])

  const hitTest = (mx: number, my: number): DragMode => {
    const cx = crop.x * displaySize.w, cy = crop.y * displaySize.h
    const cw = crop.w * displaySize.w, ch = crop.h * displaySize.h, hs = 16
    if (Math.abs(mx - cx) < hs && Math.abs(my - cy) < hs) return 'nw'
    if (Math.abs(mx - (cx + cw)) < hs && Math.abs(my - cy) < hs) return 'ne'
    if (Math.abs(mx - cx) < hs && Math.abs(my - (cy + ch)) < hs) return 'sw'
    if (Math.abs(mx - (cx + cw)) < hs && Math.abs(my - (cy + ch)) < hs) return 'se'
    if (mx > cx && mx < cx + cw && my > cy && my < cy + ch) return 'move'
    return null
  }

  const onMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const mode = hitTest(mx, my); setDragging(mode)
    if (mode) dragStart.current = { mx, my, crop: { ...crop } }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const emx = e.clientX - rect.left, emy = e.clientY - rect.top
    if (!dragging || !dragStart.current) { const m = hitTest(emx, emy); setCursor(!m ? 'default' : m === 'move' ? 'grab' : 'crosshair'); return }
    const dx = (emx - dragStart.current.mx) / displaySize.w
    const dy = (emy - dragStart.current.my) / displaySize.h
    const c = { ...dragStart.current.crop }
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    const minS = 0.05; let { x, y, w, h } = c
    if (dragging === 'move') { x = clamp(c.x + dx, 0, 1 - c.w); y = clamp(c.y + dy, 0, 1 - c.h) }
    else if (dragging === 'nw') { const nx = clamp(c.x + dx, 0, c.x + c.w - minS); const ny = clamp(c.y + dy, 0, c.y + c.h - minS); w = c.w + (c.x - nx); h = c.h + (c.y - ny); x = nx; y = ny }
    else if (dragging === 'ne') { const nw = clamp(c.w + dx, minS, 1 - c.x); const ny = clamp(c.y + dy, 0, c.y + c.h - minS); w = nw; h = c.h + (c.y - ny); y = ny }
    else if (dragging === 'sw') { const nx = clamp(c.x + dx, 0, c.x + c.w - minS); const nh = clamp(c.h + dy, minS, 1 - c.y); w = c.w + (c.x - nx); h = nh; x = nx }
    else if (dragging === 'se') { w = clamp(c.w + dx, minS, 1 - c.x); h = clamp(c.h + dy, minS, 1 - c.y) }
    setCrop({ x, y, w, h })
  }
  const onMouseUp = () => { setDragging(null); dragStart.current = null }

  const confirmCrop = async () => {
    if (!imgEl) return; setSaving(true)
    try {
      const off = document.createElement('canvas')
      const sx = Math.round(crop.x * imgEl.naturalWidth), sy = Math.round(crop.y * imgEl.naturalHeight)
      const sw = Math.round(crop.w * imgEl.naturalWidth), sh = Math.round(crop.h * imgEl.naturalHeight)
      off.width = sw; off.height = sh
      off.getContext('2d')!.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh)
      const blob: Blob = await new Promise(res => off.toBlob(b => res(b!), 'image/jpeg', 0.92))
      const file = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' })
      onConfirm(await uploadImg(file, `email-images/crop-${uid()}.jpg`))
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Drag to crop · handles at corners to resize</div>
      {displaySize.w > 0 && <canvas ref={canvasRef} style={{ display: 'block', cursor, userSelect: 'none', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} />}
      {!imgEl && <div style={{ color: '#aaa', fontSize: 13 }}>Loading image…</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ padding: '9px 24px', borderRadius: 8, background: '#333', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        <button onClick={confirmCrop} disabled={saving || !imgEl} style={{ padding: '9px 24px', borderRadius: 8, background: '#fff', color: '#111', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Uploading…' : 'Apply crop'}
        </button>
      </div>
    </div>
  )
}

// ─── Merge tags / rich text editor ───────────────────────────────────────────

const MERGE_TAGS = [
  { label: 'First name', token: '{{name}}', icon: '👤' },
  { label: 'Email address', token: '{{email}}', icon: '✉' },
  { label: 'Instagram', token: '{{instagram}}', icon: '📷' },
]

const TOKEN_PILL_STYLE = 'display:inline-block;background:#111;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-family:Arial,sans-serif;font-weight:600;letter-spacing:0.03em'

function pillify(html: string) {
  return html
    .replace(/\{\{name\}\}/g, `<span style="${TOKEN_PILL_STYLE}" contenteditable="false" data-token="{{name}}" title="{{name}}">First name</span>`)
    .replace(/\{\{email\}\}/g, `<span style="${TOKEN_PILL_STYLE}" contenteditable="false" data-token="{{email}}" title="{{email}}">Email</span>`)
    .replace(/\{\{instagram\}\}/g, `<span style="${TOKEN_PILL_STYLE}" contenteditable="false" data-token="{{instagram}}" title="{{instagram}}">Instagram</span>`)
}

function depillify(html: string) {
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('span[data-token]').forEach(el => el.replaceWith(el.getAttribute('data-token') ?? ''))
  return div.innerHTML
}

export function RichTextEditor({ content, fontFamily, onChange }: { content: string; fontFamily: string; onChange: (v: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = useState('16')
  const [mergeOpen, setMergeOpen] = useState(false)
  const savedRange = useRef<Range | null>(null)

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange()
  }
  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    if (editorRef.current) onChange(depillify(editorRef.current.innerHTML))
  }
  const insertToken = (token: string) => {
    setMergeOpen(false); editorRef.current?.focus()
    const sel = window.getSelection()
    if (savedRange.current && sel) { sel.removeAllRanges(); sel.addRange(savedRange.current) }
    const label = token === '{{name}}' ? 'First name' : token === '{{email}}' ? 'Email' : 'Instagram'
    document.execCommand('insertHTML', false, `<span style="${TOKEN_PILL_STYLE}" contenteditable="false" data-token="${token}" title="${token}">${label}</span>&nbsp;`)
    if (editorRef.current) onChange(depillify(editorRef.current.innerHTML))
  }
  const fmtBtn = (label: string, cmd: string, extra?: React.CSSProperties) => (
    <button onMouseDown={e => { e.preventDefault(); exec(cmd) }}
      style={{ padding: '4px 8px', border: '1px solid #e5e5ea', borderRadius: 5, background: '#f5f5f7', color: '#111', fontSize: 11, cursor: 'pointer', ...extra }}>
      {label}
    </button>
  )

  return (
    <div style={{ border: '1px solid #e5e5ea', borderRadius: 8, overflow: 'visible', background: '#fff' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '6px 8px', background: '#f5f5f7', borderBottom: '1px solid #e5e5ea', borderRadius: '8px 8px 0 0' }}>
        <select onChange={e => exec('fontName', e.target.value)} defaultValue={fontFamily}
          style={{ background: '#fff', border: '1px solid #e5e5ea', borderRadius: 5, padding: '3px 5px', fontSize: 10, color: '#111', outline: 'none', cursor: 'pointer' }}>
          {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={fontSize} onChange={e => {
          setFontSize(e.target.value); exec('fontSize', '7')
          setTimeout(() => { editorRef.current?.querySelectorAll('font[size="7"]').forEach(el => { (el as HTMLElement).removeAttribute('size'); (el as HTMLElement).style.fontSize = `${e.target.value}px` }) }, 0)
        }} style={{ background: '#fff', border: '1px solid #e5e5ea', borderRadius: 5, padding: '3px 5px', fontSize: 10, color: '#111', outline: 'none', cursor: 'pointer', width: 50 }}>
          {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {fmtBtn('B', 'bold', { fontWeight: 700 })}
        {fmtBtn('I', 'italic', { fontStyle: 'italic' })}
        {fmtBtn('U', 'underline', { textDecoration: 'underline' })}
        <div style={{ width: 1, background: '#e5e5ea', margin: '0 2px' }} />
        {fmtBtn('⬅', 'justifyLeft')}
        {fmtBtn('⬛', 'justifyCenter')}
        {fmtBtn('➡', 'justifyRight')}
        <div style={{ width: 1, background: '#e5e5ea', margin: '0 2px' }} />
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => { e.preventDefault(); saveSelection(); setMergeOpen(o => !o) }}
            style={{ padding: '4px 8px', border: '1px solid #e5e5ea', borderRadius: 5, background: mergeOpen ? '#111' : '#f5f5f7', color: mergeOpen ? '#fff' : '#111', fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Personalise
          </button>
          {mergeOpen && (
            <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: '#fff', border: '1px solid #e5e5ea', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, minWidth: 180 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', padding: '2px 8px 6px', fontWeight: 700 }}>Insert recipient data</div>
              {MERGE_TAGS.map(t => (
                <button key={t.token} onMouseDown={e => { e.preventDefault(); insertToken(t.token) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f7')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <span style={{ fontSize: 15 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace' }}>{t.token}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onMouseUp={saveSelection} onKeyUp={saveSelection}
        onInput={() => { if (editorRef.current) onChange(depillify(editorRef.current.innerHTML)) }}
        dangerouslySetInnerHTML={{ __html: pillify(content) }}
        style={{ minHeight: 120, padding: '10px 12px', fontSize: 14, color: '#111', outline: 'none', fontFamily: `${fontFamily}, Arial, sans-serif`, lineHeight: 1.7, borderRadius: '0 0 8px 8px' }} />
    </div>
  )
}

// ─── Block settings panel ─────────────────────────────────────────────────────

export function BlockSettings({ block, onUpdate, uploadImg }: {
  block: EmailBlock; onUpdate: (b: EmailBlock) => void; uploadImg: (f: File, p: string) => Promise<string>
}) {
  const [uploading, setUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  const set = (key: string, val: unknown) => onUpdate({ ...block, [key]: val } as EmailBlock)
  const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} style={{ ...settingsInpStyle, ...props.style }} />

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
            style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: `1px solid ${(block as any)[key] === a ? '#111' : '#e5e5ea'}`, background: (block as any)[key] === a ? '#111' : '#f5f5f7', color: (block as any)[key] === a ? '#fff' : '#6e6e73', fontSize: 11, cursor: 'pointer' }}>
            {a === 'left' ? '⬅' : a === 'center' ? '⬛' : '➡'}
          </button>
        ))}
      </div>
    </SettingsField>
  )
  const uploadField = (label: string, key: string, r: React.RefObject<HTMLInputElement | null>, pathPrefix: string) => (
    <SettingsField label={label}>
      <input ref={r} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setUploading(true); try { set(key, await uploadImg(f, `${pathPrefix}/${uid()}.${f.name.split('.').pop()}`)) } finally { setUploading(false) } }} />
      <div style={{ display: 'flex', gap: 6 }}>
        {inp({ type: 'url', value: (block as any)[key] ?? '', onChange: e => set(key, e.target.value), placeholder: 'Paste URL or upload…', style: { fontSize: 11 } })}
        <button onClick={() => r.current?.click()} style={{ padding: '6px 10px', background: '#f0f0f2', border: '1px solid #e5e5ea', borderRadius: 6, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{uploading ? '…' : '↑'}</button>
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
      {colorRow('Background', 'bgColor')} {colorRow('Text colour', 'textColor')}
      {uploadField('Logo image', 'logoSrc', logoRef, 'email-logos')}
      <SettingsField label="Logo width (px)">{inp({ type: 'number', value: block.logoWidth, min: 40, max: 400, onChange: e => set('logoWidth', Number(e.target.value)) })}</SettingsField>
      {alignRow('align')}
      <SettingsField label="Title">
        {inp({ type: 'text', value: block.title, onChange: e => set('title', e.target.value) })}
        <TypographyRow font={block.titleFont ?? 'Arial'} size={block.titleSize ?? 24} bold={block.titleBold ?? true} italic={block.titleItalic ?? false} onFont={v => set('titleFont', v)} onSize={v => set('titleSize', v)} onBold={v => set('titleBold', v)} onItalic={v => set('titleItalic', v)} />
      </SettingsField>
      <SettingsField label="Subtitle">
        {inp({ type: 'text', value: block.subtitle, onChange: e => set('subtitle', e.target.value) })}
        <TypographyRow font={block.subtitleFont ?? 'Arial'} size={block.subtitleSize ?? 14} bold={block.subtitleBold ?? false} italic={block.subtitleItalic ?? false} onFont={v => set('subtitleFont', v)} onSize={v => set('subtitleSize', v)} onBold={v => set('subtitleBold', v)} onItalic={v => set('subtitleItalic', v)} />
      </SettingsField>
      {numField('Padding', 'padding', 8, 80)}
    </div>
  )

  if (block.type === 'image') return (
    <div>
      {cropSrc && <ImageCropModal src={cropSrc} uploadImg={uploadImg} onClose={() => setCropSrc(null)} onConfirm={url => { set('src', url); setCropSrc(null) }} />}
      {uploadField('Image', 'src', imgRef, 'email-images')}
      {block.src && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setCropSrc(block.src)} style={{ width: '100%', padding: '7px 0', borderRadius: 7, border: '1px solid #e5e5ea', background: '#f5f5f7', color: '#111', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>✂ Crop image</button>
        </div>
      )}
      <SettingsField label="Alt text">{inp({ type: 'text', value: block.alt, onChange: e => set('alt', e.target.value) })}</SettingsField>
      <SettingsField label="Link URL">{inp({ type: 'url', value: block.link, onChange: e => set('link', e.target.value), placeholder: 'https://…' })}</SettingsField>
      {numField('Width (%)', 'width', 10, 100)} {numField('Border radius', 'borderRadius', 0, 40)} {numField('Padding', 'padding', 0, 60)}
      {alignRow('align')} {colorRow('Background', 'bgColor')}
    </div>
  )

  if (block.type === 'text') return (
    <div>
      <SettingsField label="Content"><RichTextEditor content={block.content} fontFamily={block.fontFamily} onChange={v => set('content', v)} /></SettingsField>
      {numField('Padding', 'padding', 0, 80)} {colorRow('Background', 'bgColor')}
    </div>
  )

  if (block.type === 'button') return (
    <div>
      <SettingsField label="Button text">{inp({ type: 'text', value: block.text, onChange: e => set('text', e.target.value) })}</SettingsField>
      <SettingsField label="Link URL">{inp({ type: 'url', value: block.url, onChange: e => set('url', e.target.value), placeholder: 'https://…' })}</SettingsField>
      {colorRow('Button colour', 'buttonBg')} {colorRow('Text colour', 'textColor')} {colorRow('Section background', 'bgColor')}
      {numField('Font size', 'fontSize', 10, 24)} {numField('Vertical padding', 'paddingV', 6, 40)} {numField('Horizontal padding', 'paddingH', 8, 80)} {numField('Border radius', 'borderRadius', 0, 40)}
      {alignRow('align')}
      <SettingsField label="Full width">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={block.fullWidth} onChange={e => set('fullWidth', e.target.checked)} />
          <span style={{ fontSize: 12, color: '#111' }}>Stretch button to full width</span>
        </label>
      </SettingsField>
    </div>
  )

  if (block.type === 'divider') return <div>{colorRow('Line colour', 'color')} {colorRow('Background', 'bgColor')} {numField('Line thickness', 'height', 1, 8)} {numField('Vertical margin', 'marginV', 0, 60)}</div>
  if (block.type === 'spacer') return <div>{numField('Height', 'height', 8, 120)} {colorRow('Background', 'bgColor')}</div>
  return null
}

// ─── Block in canvas ──────────────────────────────────────────────────────────

export function BlockInCanvas({ block, selected, total, index, onSelect, onDelete, onDuplicate, onMoveUp, onMoveDown, onUpdate, uploadImg }: {
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
          {block.title && <div style={{ color: block.textColor, fontFamily: `${block.titleFont ?? 'Arial'}, Arial, sans-serif`, fontSize: block.titleSize ?? 24, fontWeight: block.titleBold ? 700 : 400, fontStyle: block.titleItalic ? 'italic' : 'normal', marginTop: block.logoSrc ? 12 : 0 }}>{block.title}</div>}
          {block.subtitle && <div style={{ color: block.textColor, fontFamily: `${block.subtitleFont ?? 'Arial'}, Arial, sans-serif`, fontSize: block.subtitleSize ?? 14, fontWeight: block.subtitleBold ? 700 : 400, fontStyle: block.subtitleItalic ? 'italic' : 'normal', opacity: 0.75, marginTop: 4 }}>{block.subtitle}</div>}
        </div>
      )
      case 'image': return (
        <div style={{ background: block.bgColor, padding: block.padding, textAlign: block.align as any }}>
          {block.src ? <img src={block.src} alt={block.alt} style={{ maxWidth: `${block.width}%`, height: 'auto', display: 'block', margin: block.align === 'center' ? '0 auto' : undefined, borderRadius: block.borderRadius }} />
            : <div style={{ height: 120, background: '#f0f0f2', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, color: '#6e6e73', fontSize: 12 }}>Click to add image</div>}
        </div>
      )
      case 'text': return <div style={{ background: block.bgColor, padding: block.padding, fontFamily: `${block.fontFamily}, Arial, sans-serif` }} dangerouslySetInnerHTML={{ __html: block.content }} />
      case 'button': return (
        <div style={{ background: block.bgColor, padding: '20px 32px', textAlign: block.align as any }}>
          <span style={{ display: block.fullWidth ? 'block' : 'inline-block', background: block.buttonBg, color: block.textColor, padding: `${block.paddingV}px ${block.paddingH}px`, borderRadius: block.borderRadius, fontSize: block.fontSize, fontWeight: 600, cursor: 'pointer' }}>{block.text || 'Click here'}</span>
        </div>
      )
      case 'divider': return <div style={{ background: block.bgColor, padding: `${block.marginV}px 32px` }}><div style={{ height: block.height, background: block.color }} /></div>
      case 'spacer': return <div style={{ background: block.bgColor, height: block.height }} />
    }
  })()
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={onSelect}
      style={{ position: 'relative', cursor: 'pointer', outline: selected ? '2px solid #111' : hovered ? '2px solid #d0d0d5' : '2px solid transparent', outlineOffset: -2 }}>
      {inner}
      {(hovered || selected) && (
        <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2, zIndex: 10 }} onClick={e => e.stopPropagation()}>
          {index > 0 && <button onClick={onMoveUp} style={btnStyle}>↑</button>}
          {index < total - 1 && <button onClick={onMoveDown} style={btnStyle}>↓</button>}
          <button onClick={onDuplicate} style={btnStyle}>⧉</button>
          <button onClick={onDelete} style={{ ...btnStyle, background: '#fee2e2', color: '#dc2626' }}>✕</button>
        </div>
      )}
      {selected && <div style={{ position: 'absolute', top: 4, left: 4, background: '#111', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{block.type}</div>}
    </div>
  )
}

// ─── Insert button ────────────────────────────────────────────────────────────

const BLOCK_PALETTE = [
  { type: 'header' as BlockType, icon: '▬', label: 'Header' },
  { type: 'image' as BlockType, icon: '🖼', label: 'Image' },
  { type: 'text' as BlockType, icon: 'T', label: 'Text' },
  { type: 'button' as BlockType, icon: '⬛', label: 'Button' },
  { type: 'divider' as BlockType, icon: '—', label: 'Divider' },
  { type: 'spacer' as BlockType, icon: '↕', label: 'Spacer' },
]

export function InsertButton({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: open ? '#111' : '#e5e5ea', color: open ? '#fff' : '#6e6e73', border: 'none', borderRadius: 12, width: 24, height: 24, fontSize: 14, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      {open && (
        <div style={{ position: 'absolute', top: 28, zIndex: 20, background: '#fff', border: '1px solid #e5e5ea', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'flex', gap: 4 }}>
          {BLOCK_PALETTE.map(b => (
            <button key={b.type} onClick={() => { onAdd(b.type); setOpen(false) }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 10px', border: '1px solid #e5e5ea', borderRadius: 8, background: '#fafafa', cursor: 'pointer', fontSize: 10, color: '#111', minWidth: 52 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f0f0f2' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fafafa' }}>
              <span style={{ fontSize: 16 }}>{b.icon}</span>{b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Full-screen modal ────────────────────────────────────────────────────────

export function EmailBuilderModal({ label, config, onChange, showSendAt, uploadImg, onClose, logoSrc = '/mansion-logo.png' }: {
  label: string; config: EmailConfig; onChange: (c: EmailConfig) => void
  showSendAt?: boolean; uploadImg: (f: File, p: string) => Promise<string>
  onClose: () => void; logoSrc?: string
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
    const blocks = [...cfg.blocks]; blocks.splice(atIndex ?? blocks.length, 0, nb)
    setBlocks(blocks); setSelectedId(nb.id)
  }
  const deleteBlock = (id: string) => { setBlocks(cfg.blocks.filter(b => b.id !== id)); setSelectedId(null) }
  const duplicateBlock = (id: string) => {
    const idx = cfg.blocks.findIndex(b => b.id === id); if (idx < 0) return
    const nb = { ...cfg.blocks[idx], id: uid() }
    const blocks = [...cfg.blocks]; blocks.splice(idx + 1, 0, nb); setBlocks(blocks); setSelectedId(nb.id)
  }
  const moveBlock = (from: number, to: number) => {
    if (to < 0 || to >= cfg.blocks.length) return
    const blocks = [...cfg.blocks]; const [item] = blocks.splice(from, 1); blocks.splice(to, 0, item); setBlocks(blocks)
  }
  const selectedBlock = cfg.blocks.find(b => b.id === selectedId) ?? null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', background: '#111' }}>
      {/* Top bar */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: '#000', borderBottom: '1px solid #222', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer' }}>← Back</button>
          <img src={logoSrc} alt="Logo" style={{ height: 28, width: 'auto', objectFit: 'contain', opacity: 0.9 }} />
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{label}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['desktop', 'mobile'] as const).map(m => (
            <button key={m} onClick={() => setPreview(m)}
              style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: preview === m ? '#333' : 'transparent', color: preview === m ? '#fff' : '#aaa', fontSize: 12, cursor: 'pointer' }}>
              {m === 'desktop' ? '🖥 Desktop' : '📱 Mobile'}
            </button>
          ))}
          <button onClick={() => setLivePreview(l => !l)}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: livePreview ? '#16a34a' : 'transparent', color: livePreview ? '#fff' : '#aaa', fontSize: 12, cursor: 'pointer', marginLeft: 8 }}>
            {livePreview ? '● Live' : '○ Live'}
          </button>
        </div>
        <button onClick={onClose} style={{ padding: '7px 20px', borderRadius: 8, background: '#fff', color: '#111', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Done</button>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left */}
        <div style={{ width: 200, background: '#0a0a0a', borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #222' }}>
            {(['blocks', 'settings'] as const).map(t => (
              <button key={t} onClick={() => setLeftTab(t)}
                style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: leftTab === t ? '2px solid #fff' : '2px solid transparent', color: leftTab === t ? '#fff' : '#888', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', border: '1px solid #222', borderRadius: 8, background: '#1a1a1a', color: '#ccc', fontSize: 10, cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2a2a' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1a1a1a' }}>
                      <span style={{ fontSize: 20 }}>{b.icon}</span>{b.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {leftTab === 'settings' && (
              <div>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email settings</div>
                {[{ label: 'Subject line', key: 'subject', placeholder: "e.g. You're on the list 🎉" }, { label: 'Preheader', key: 'preheader', placeholder: 'Short preview text…' }].map(f => (
                  <div key={f.key} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{f.label}</div>
                    <input type="text" value={(cfg as any)[f.key]} onChange={e => onChange({ ...cfg, [f.key]: e.target.value })} placeholder={f.placeholder}
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #222', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                {showSendAt && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Send date & time</div>
                    <input type="datetime-local" value={(cfg as any).sendAt ?? ''} onChange={e => onChange({ ...cfg, sendAt: e.target.value })}
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #222', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#fff', outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#666', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Design</div>
                {[{ label: 'Email background', key: 'emailBgColor' }, { label: 'Content background', key: 'contentBgColor' }].map(f => (
                  <div key={f.key} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{f.label}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="color" value={(cfg as any)[f.key]} onChange={e => onChange({ ...cfg, [f.key]: e.target.value })} style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #222', padding: 1, cursor: 'pointer', flexShrink: 0, background: 'none' }} />
                      <input type="text" value={(cfg as any)[f.key]} onChange={e => onChange({ ...cfg, [f.key]: e.target.value })} style={{ flex: 1, background: '#1a1a1a', border: '1px solid #222', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: '#fff', outline: 'none', fontFamily: 'monospace' }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Font family</div>
                  <select value={cfg.fontFamily} onChange={e => onChange({ ...cfg, fontFamily: e.target.value })}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #222', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#fff', outline: 'none' }}>
                    {FONTS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', background: '#222' }} onClick={() => setSelectedId(null)}>
          {livePreview ? (
            <div style={{ maxWidth: preview === 'mobile' ? 390 : 660, margin: '0 auto' }}>
              <iframe srcDoc={generateEmailHTML(cfg, 'Alex')} style={{ width: '100%', height: 800, border: 'none', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }} title="Preview" />
            </div>
          ) : (
            <div style={{ maxWidth: preview === 'mobile' ? 390 : 660, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ background: cfg.emailBgColor, padding: 16, borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
                <div style={{ background: cfg.contentBgColor, fontFamily: `${cfg.fontFamily}, Arial, sans-serif` }}>
                  <InsertButton onAdd={type => addBlock(type, 0)} />
                  {cfg.blocks.map((block, i) => (
                    <div key={block.id}>
                      <BlockInCanvas block={block} selected={block.id === selectedId} total={cfg.blocks.length} index={i}
                        onSelect={() => setSelectedId(block.id)} onDelete={() => deleteBlock(block.id)}
                        onDuplicate={() => duplicateBlock(block.id)} onMoveUp={() => moveBlock(i, i - 1)} onMoveDown={() => moveBlock(i, i + 1)}
                        onUpdate={updates => updateBlock(block.id, updates)} uploadImg={uploadImg} />
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

        {/* Right */}
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
