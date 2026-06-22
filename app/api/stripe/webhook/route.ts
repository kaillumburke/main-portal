import { NextRequest, NextResponse } from 'next/server'
import stripe from '@/lib/stripe-server'
import { db } from '@/lib/firebase-admin'

// Stripe sends raw body — disable Next.js body parsing
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function findAppByStripeId(stripeAccountId: string) {
  const snap = await db.collection('platform_apps').where('stripeAccountId', '==', stripeAccountId).limit(1).get()
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  let event
  try {
    const body = await req.text()
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as { id: string; details_submitted: boolean; charges_enabled: boolean; payouts_enabled: boolean }
    const onboardingComplete = account.details_submitted && account.charges_enabled && account.payouts_enabled

    const app = await findAppByStripeId(account.id)
    if (app) {
      await db.collection('platform_apps').doc(app.id as string).update({
        stripeOnboardingComplete: onboardingComplete,
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
      })
    }
  }

  return NextResponse.json({ received: true })
}
