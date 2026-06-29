import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { serverDb } from '@/lib/firebase-server'
import { collection, query, where, getDocs, updateDoc, Timestamp } from 'firebase/firestore'
import type { EmailConfig } from '@/lib/email-builder'
import { generateEmailHTML } from '@/lib/email-builder'

function legacyHtml(bodyText: string, senderName: string) {
  const lines = bodyText.split('\n')
    .map(l => l.trim() === '' ? '<br/>' : `<p style="margin:0 0 10px;line-height:1.6">${l}</p>`).join('')
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#111">
    <div style="font-size:16px;font-weight:800;letter-spacing:-0.02em;margin-bottom:28px;text-transform:uppercase">${senderName}</div>
    ${lines}
  </div>`
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY!)
  const now = Timestamp.now()

  const snap = await getDocs(
    query(collection(serverDb, 'scheduledSignUpEmails'), where('sent', '==', false), where('sendAt', '<=', now))
  )

  if (snap.empty) return NextResponse.json({ sent: 0 })

  let sent = 0
  const errors: string[] = []

  await Promise.all(snap.docs.map(async docSnap => {
    const d = docSnap.data() as {
      from: string; senderName: string; userEmail: string; userName: string; userInstagram?: string
      emailConfig?: EmailConfig
      // Legacy
      subject?: string; body?: string
    }
    try {
      const name = d.userName || 'there'
      let html: string
      let subject: string

      if (d.emailConfig) {
        subject = d.emailConfig.subject
        html = generateEmailHTML(d.emailConfig, name, d.userEmail, d.userInstagram ?? '')
      } else {
        subject = d.subject ?? ''
        html = legacyHtml((d.body ?? '').replace(/\{\{name\}\}/g, name), d.senderName)
      }

      if (!subject) {
        await updateDoc(docSnap.ref, { sent: true, skipped: true, sentAt: Timestamp.now() })
        return
      }

      await resend.emails.send({ from: d.from, to: d.userEmail, subject, html })
      await updateDoc(docSnap.ref, { sent: true, sentAt: Timestamp.now() })
      sent++
    } catch (err) {
      errors.push(`${docSnap.id}: ${String(err)}`)
    }
  }))

  return NextResponse.json({ sent, errors })
}
