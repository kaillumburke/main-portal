'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Image from 'next/image'

export default function LoginPage() {
  const { signIn, user, loading } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && user) router.replace('/home')
  }, [user, loading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      router.replace('/home')
    } catch {
      setError('Invalid email or password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#f5f5f7', fontFamily: 'Inter, -apple-system, sans-serif' }}>

      {/* Left panel – branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 p-10"
        style={{ background: '#111111', borderRight: '1px solid #1a1a1a' }}>
        <div>
          <Image src="/connect-logo.png" alt="Connect" width={140} height={36} style={{ width: 140, height: 'auto', filter: 'brightness(0) invert(1)' }} priority />
        </div>
        <div>
          <p className="text-[13px] leading-relaxed mb-6" style={{ color: '#666' }}>
            Manage events, tickets, guest lists, and payouts — all in one place.
          </p>
          <div className="flex flex-col gap-3">
            {['Real-time sales analytics', 'Multi-app management', 'Stripe payouts built in'].map(f => (
              <div key={f} className="flex items-center gap-3 text-[13px]" style={{ color: '#888' }}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#444' }} />
                {f}
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px]" style={{ color: '#333' }}>© 2025 Connect.</p>
      </div>

      {/* Right panel – form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10">
          <Image src="/connect-logo.png" alt="Connect" width={130} height={34} style={{ width: 130, height: 'auto' }} priority />
        </div>

        <div className="w-full max-w-[360px]">
          <h1 className="text-xl font-bold mb-1" style={{ color: '#111111' }}>Welcome back</h1>
          <p className="text-[13px] mb-8" style={{ color: '#6e6e73' }}>Sign in to your management portal</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: '#6e6e73' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e5ea',
                  color: '#111111',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#111111')}
                onBlur={e => (e.currentTarget.style.borderColor = '#e5e5ea')}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: '#6e6e73' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e5ea',
                  color: '#111111',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#111111')}
                onBlur={e => (e.currentTarget.style.borderColor = '#e5e5ea')}
              />
            </div>

            {error && (
              <div className="rounded-lg px-4 py-2.5 text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full rounded-xl py-3 text-sm font-semibold tracking-wide transition-opacity disabled:opacity-50 cursor-pointer"
              style={{ background: '#111111', color: '#ffffff' }}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
