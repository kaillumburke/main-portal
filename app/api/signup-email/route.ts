import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { serverDb } from '@/lib/firebase-server'
import { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

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

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  try {
    const { linkId, userEmail, userName } = await req.json()
    if (!linkId || !userEmail) {
      return NextResponse.json({ error: 'linkId and userEmail required' }, { status: 400 })
    }

    const linkSnap = await getDoc(doc(serverDb, 'signUpLinks', linkId))
    if (!linkSnap.exists()) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }

    const link = linkSnap.data() as {
      senderName?: string
      emailSubject?: string
      emailBody?: string
      followUp1Subject?: string
      followUp1Body?: string
      followUp1SendAt?: Timestamp
      followUp2Subject?: string
      followUp2Body?: string
      followUp2SendAt?: Timestamp
    }

    const senderName = link.senderName?.trim() || 'Mansion Liverpool'
    const from = `${senderName} <hello@connectclub.live>`
    const replace = (text: string) => text.replace(/\{\{name\}\}/g, userName ?? 'there')

    if (link.emailSubject && link.emailBody) {
      await resend.emails.send({
        from,
        to: userEmail,
        subject: link.emailSubject,
        html: buildHtml(replace(link.emailBody), senderName),
      })
    }

    const scheduledCol = collection(serverDb, 'scheduledSignUpEmails')

    if (link.followUp1Subject && link.followUp1Body && link.followUp1SendAt) {
      await addDoc(scheduledCol, {
        linkId,
        userEmail,
        userName: userName ?? '',
        from,
        senderName,
        subject: link.followUp1Subject,
        body: link.followUp1Body,
        sendAt: link.followUp1SendAt.toDate(),
        sent: false,
        createdAt: serverTimestamp(),
      })
    }

    if (link.followUp2Subject && link.followUp2Body && link.followUp2SendAt) {
      await addDoc(scheduledCol, {
        linkId,
        userEmail,
        userName: userName ?? '',
        from,
        senderName,
        subject: link.followUp2Subject,
        body: link.followUp2Body,
        sendAt: link.followUp2SendAt.toDate(),
        sent: false,
        createdAt: serverTimestamp(),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('signup-email error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
