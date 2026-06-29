import { NextRequest, NextResponse } from 'next/server'

const APP_ID = process.env.ONESIGNAL_APP_ID ?? process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? ''
const REST_KEY = process.env.ONESIGNAL_REST_KEY ?? process.env.NEXT_PUBLIC_ONESIGNAL_REST_KEY ?? ''

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()

    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${REST_KEY}`,
      },
      body: JSON.stringify({ ...payload, app_id: APP_ID }),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('send-notification error:', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const notifId = searchParams.get('id')

  if (!notifId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const res = await fetch(`https://onesignal.com/api/v1/notifications/${notifId}?app_id=${APP_ID}`, {
      headers: { 'Authorization': `Key ${REST_KEY}` },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch notification status' }, { status: 500 })
  }
}
