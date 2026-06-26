import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/firebase-admin'

function buildHtml(bodyText: string, senderName: string) {
  const lines = bodyText
    .split('\n')
    .map(line => line.trim() === '' ? '<br/>' : `<p style="margin:0 0 10px;line-height:1.6">${line}</p>`)
    .join('')
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#111;">
    <div style="font-size:16px;font-weight:800;letter-spacing:-0.02em;margin-bottom:28px;text-transform:uppercase;">${senderName}</div>
    ${lines}
  </div>`
}

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY!)
  const now = new Date()

  const snap = await db.collection('scheduledSignUpEmails')
    .where('sent', '==', false)
    .where('sendAt', '<=', now)
    .limit(50)
    .get()

  if (snap.empty) {
    return NextResponse.json({ sent: 0 })
  }

  let sent = 0
  const errors: string[] = []

  await Promise.all(snap.docs.map(async docSnap => {
    const d = docSnap.data() as {
      from: string; senderName: string; userEmail: string; userName: string;
      subject: string; body: string
    }
    try {
      await resend.emails.send({
        from: d.from,
        to: d.userEmail,
        subject: d.subject,
        html: buildHtml(d.body.replace(/\{\{name\}\}/g, d.userName || 'there'), d.senderName),
      })
      await docSnap.ref.update({ sent: true, sentAt: new Date() })
      sent++
    } catch (err) {
      errors.push(`${docSnap.id}: ${String(err)}`)
    }
  }))

  return NextResponse.json({ sent, errors })
}
