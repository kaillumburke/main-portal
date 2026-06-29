import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { serverDb } from '@/lib/firebase-server'
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore'
import type { EmailConfig } from '@/app/mansion/dashboard/signups/page'
import { generateEmailHTML } from '@/app/mansion/dashboard/signups/page'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  try {
    const { linkId, userEmail, userName, userInstagram } = await req.json()
    if (!linkId || !userEmail) {
      return NextResponse.json({ error: 'linkId and userEmail required' }, { status: 400 })
    }

    const linkSnap = await getDoc(doc(serverDb, 'signUpLinks', linkId))
    if (!linkSnap.exists()) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }

    const link = linkSnap.data() as {
      senderName?: string
      confirmationEmail?: EmailConfig
      followUp1?: EmailConfig & { sendAt?: { toDate: () => Date } }
      followUp2?: EmailConfig & { sendAt?: { toDate: () => Date } }
      // Legacy
      emailSubject?: string
      emailBody?: string
      followUp1Subject?: string
      followUp1Body?: string
      followUp1SendAt?: { toDate: () => Date }
      followUp2Subject?: string
      followUp2Body?: string
      followUp2SendAt?: { toDate: () => Date }
    }

    const senderName = link.senderName?.trim() || 'Mansion Liverpool'
    const from = `${senderName} <hello@connectclub.live>`

    // ── Confirmation email ──
    const conf = link.confirmationEmail
    if (conf?.enabled && conf.subject) {
      await resend.emails.send({
        from,
        to: userEmail,
        subject: conf.subject,
        ...(conf.preheader ? { text: conf.preheader } : {}),
        html: generateEmailHTML(conf, userName ?? 'there', userEmail, userInstagram ?? ''),
      })
    } else if (!conf && link.emailSubject && link.emailBody) {
      // Legacy fallback
      const lines = link.emailBody.replace(/\{\{name\}\}/g, userName ?? 'there').split('\n')
        .map(l => l.trim() === '' ? '<br/>' : `<p style="margin:0 0 10px;line-height:1.6">${l}</p>`).join('')
      await resend.emails.send({
        from, to: userEmail, subject: link.emailSubject,
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#111">${lines}</div>`,
      })
    }

    // ── Schedule follow-ups ──
    const scheduledCol = collection(serverDb, 'scheduledSignUpEmails')

    const fu1 = link.followUp1
    if (fu1?.enabled && fu1.subject && fu1.sendAt) {
      await addDoc(scheduledCol, {
        linkId, userEmail, userName: userName ?? '', userInstagram: userInstagram ?? '', from, senderName,
        emailConfig: fu1,
        sendAt: fu1.sendAt.toDate ? fu1.sendAt.toDate() : new Date(fu1.sendAt as unknown as string),
        sent: false,
        createdAt: serverTimestamp(),
      })
    } else if (!fu1 && link.followUp1Subject && link.followUp1Body && link.followUp1SendAt) {
      await addDoc(scheduledCol, {
        linkId, userEmail, userName: userName ?? '', from, senderName,
        subject: link.followUp1Subject, body: link.followUp1Body,
        sendAt: link.followUp1SendAt.toDate(),
        sent: false, createdAt: serverTimestamp(),
      })
    }

    const fu2 = link.followUp2
    if (fu2?.enabled && fu2.subject && fu2.sendAt) {
      await addDoc(scheduledCol, {
        linkId, userEmail, userName: userName ?? '', from, senderName,
        emailConfig: fu2,
        sendAt: fu2.sendAt.toDate ? fu2.sendAt.toDate() : new Date(fu2.sendAt as unknown as string),
        sent: false,
        createdAt: serverTimestamp(),
      })
    } else if (!fu2 && link.followUp2Subject && link.followUp2Body && link.followUp2SendAt) {
      await addDoc(scheduledCol, {
        linkId, userEmail, userName: userName ?? '', from, senderName,
        subject: link.followUp2Subject, body: link.followUp2Body,
        sendAt: link.followUp2SendAt.toDate(),
        sent: false, createdAt: serverTimestamp(),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('signup-email error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
