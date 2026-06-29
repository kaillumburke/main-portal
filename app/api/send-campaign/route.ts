import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'


export async function POST(req: NextRequest) {
  try {
    const { subject, html, recipients, fromName, campaignId } = await req.json()

    if (!subject || !html || !recipients?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const from = `${fromName || 'Connect'} <hello@connectclub.live>`

    // Resend batch limit is 100 per call — chunk if needed
    const chunks: string[][] = []
    for (let i = 0; i < recipients.length; i += 100) {
      chunks.push(recipients.slice(i, i + 100))
    }

    let sent = 0
    let failed = 0

    for (const chunk of chunks) {
      const batch = chunk.map((to: string) => ({ from, to, subject, html }))
      const result = await resend.batch.send(batch)
      sent += result.data?.data?.length ?? chunk.length
    }

    return NextResponse.json({ ok: true, sent, failed, total: recipients.length })
  } catch (err) {
    console.error('send-campaign error:', err)
    return NextResponse.json({ error: 'Failed to send campaign' }, { status: 500 })
  }
}
