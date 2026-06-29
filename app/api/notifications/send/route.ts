import { NextRequest, NextResponse } from 'next/server'
import http2 from 'node:http2'
import crypto from 'node:crypto'
import { serverDb } from '@/lib/firebase-server'
import { collection, getDocs } from 'firebase/firestore'

const KEY_ID = process.env.APNS_KEY_ID!        // XKZFVWUVK3
const TEAM_ID = process.env.APNS_TEAM_ID!       // 4V275QTAVK
const BUNDLE_ID = process.env.APNS_BUNDLE_ID!   // ShareStudio.Mansion-Nightclub
const P8_KEY = process.env.APNS_P8_KEY!

// JWT is valid for 1 hour — generate fresh per batch
function generateJWT(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) })).toString('base64url')
  const unsigned = `${header}.${payload}`
  const sign = crypto.createSign('SHA256')
  sign.update(unsigned)
  // APNs requires IEEE P1363 format (r || s), not DER
  const sig = sign.sign({ key: P8_KEY, dsaEncoding: 'ieee-p1363' })
  return `${unsigned}.${sig.toString('base64url')}`
}

function sendToApns(token: string, environment: string, apnsPayload: object, jwt: string): Promise<{ ok: boolean; status: number; reason?: string }> {
  const host = environment === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com'
  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`, { rejectUnauthorized: true })
    client.on('error', (err) => {
      client.destroy()
      resolve({ ok: false, status: 0, reason: err.message })
    })

    const body = JSON.stringify(apnsPayload)
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      'authorization': `bearer ${jwt}`,
      'apns-topic': BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body).toString(),
    })

    let responseData = ''
    req.on('response', (headers) => {
      const status = Number(headers[':status'])
      req.setEncoding('utf8')
      req.on('data', (chunk) => { responseData += chunk })
      req.on('end', () => {
        client.close()
        if (status === 200) {
          resolve({ ok: true, status })
        } else {
          try {
            const parsed = JSON.parse(responseData)
            resolve({ ok: false, status, reason: parsed.reason })
          } catch {
            resolve({ ok: false, status, reason: responseData })
          }
        }
      })
    })

    req.write(body)
    req.end()
  })
}

export async function POST(req: NextRequest) {
  try {
    const { title, body, data } = await req.json()

    const snapshot = await getDocs(collection(serverDb, 'push_tokens'))
    if (snapshot.empty) {
      return NextResponse.json({ successful: 0, total: 0, message: 'No registered devices' })
    }

    const jwt = generateJWT()
    const apnsPayload = {
      aps: {
        alert: { title, body },
        sound: 'default',
      },
      ...(data ?? {}),
    }

    const results = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const { token, environment } = doc.data() as { token: string; environment: string }
        if (!token) return { ok: false, status: 0, reason: 'no token' }
        const result = await sendToApns(token, environment, apnsPayload, jwt)
        console.log(`APNs [${environment}] ${token.slice(0, 8)}… → ${result.ok ? '✅' : `❌ ${result.reason}`}`)
        return result
      })
    )

    const successful = results.filter(r => r.ok).length
    const failed = results.filter(r => !r.ok)
    const reasons = [...new Set(failed.map(r => r.reason).filter(Boolean))]

    return NextResponse.json({
      successful,
      total: results.length,
      ...(reasons.length ? { errors: reasons } : {}),
    })
  } catch (err) {
    console.error('APNs send error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
