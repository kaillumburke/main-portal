import { NextRequest, NextResponse } from 'next/server'
import stripe from '@/lib/stripe-server'
import { getAppConfig, saveAppConfig, ensureMansionConfig } from '@/lib/platform-config'

export async function POST(req: NextRequest) {
  try {
    const { appId } = await req.json()
    if (!appId) return NextResponse.json({ error: 'appId required' }, { status: 400 })

    let config = await getAppConfig(appId)
    if (!config && appId === 'mansion') config = await ensureMansionConfig()
    if (!config) return NextResponse.json({ error: 'App not found' }, { status: 404 })

    // Create a new Express account if one doesn't exist yet
    let stripeAccountId = config.stripeAccountId
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { appId },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      })
      stripeAccountId = account.id
      await saveAppConfig({ ...config, stripeAccountId })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/stripe/refresh?appId=${appId}`,
      return_url: `${baseUrl}/stripe/return?appId=${appId}`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (err) {
    console.error('Stripe account link error:', err)
    return NextResponse.json({ error: 'Failed to create onboarding link' }, { status: 500 })
  }
}
