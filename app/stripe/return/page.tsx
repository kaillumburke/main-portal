'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getAppConfig } from '@/lib/platform-config'

function ReturnContent() {
  const params = useSearchParams()
  const router = useRouter()
  const appId = params.get('appId')
  const [status, setStatus] = useState<'checking' | 'complete' | 'incomplete'>('checking')
  const [appName, setAppName] = useState('')

  useEffect(() => {
    if (!appId) return
    let attempts = 0
    const check = async () => {
      const config = await getAppConfig(appId)
      if (config) setAppName(config.name)
      if (config?.stripeOnboardingComplete) {
        setStatus('complete')
      } else if (attempts >= 5) {
        setStatus('incomplete')
      } else {
        attempts++
        setTimeout(check, 1500)
      }
    }
    check()
  }, [appId])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#080808' }}>
      {status === 'checking' && (
        <div className="text-center">
          <div className="text-white font-semibold mb-2">Verifying your account…</div>
          <div className="text-xs" style={{ color: '#555' }}>This only takes a moment</div>
        </div>
      )}

      {status === 'complete' && (
        <div className="text-center">
          <div className="text-4xl mb-4">✓</div>
          <div className="text-lg font-bold text-white mb-1">{appName} is connected</div>
          <div className="text-sm mb-6" style={{ color: '#555' }}>Stripe payouts are now enabled for this app</div>
          <button onClick={() => router.replace('/apps')}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: '#C9A84C', color: '#000' }}>
            Back to Apps
          </button>
        </div>
      )}

      {status === 'incomplete' && (
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <div className="text-lg font-bold text-white mb-1">Onboarding incomplete</div>
          <div className="text-sm mb-6" style={{ color: '#555' }}>
            Stripe still needs more information to activate your account.
            You can complete this later from the Apps page.
          </div>
          <button onClick={() => router.replace('/apps')}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a' }}>
            Back to Apps
          </button>
        </div>
      )}
    </div>
  )
}

export default function StripeReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
        <div className="text-white text-sm">Loading…</div>
      </div>
    }>
      <ReturnContent />
    </Suspense>
  )
}
