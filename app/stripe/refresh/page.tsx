'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

function RefreshContent() {
  const params = useSearchParams()
  const appId = params.get('appId')

  useEffect(() => {
    if (!appId) return
    fetch('/api/stripe/create-account-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId }),
    })
      .then(r => r.json())
      .then(data => { if (data.url) window.location.href = data.url })
  }, [appId])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
      <div className="text-center">
        <div className="text-white font-semibold mb-2">Refreshing your onboarding link…</div>
        <div className="text-xs" style={{ color: '#555' }}>You'll be redirected to Stripe shortly</div>
      </div>
    </div>
  )
}

export default function StripeRefreshPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
        <div className="text-white text-sm">Loading…</div>
      </div>
    }>
      <RefreshContent />
    </Suspense>
  )
}
