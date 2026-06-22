'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import SplashScreen from './SplashScreen'

const S = {
  bg: '#f5f5f7',
  border: '#e5e5ea',
  cardBg: '#ffffff',
  sectionLabel: '#aeaeb2',
  navInactive: '#6e6e73',
  navActive: '#ffffff',
  navActiveBg: '#111111',
  textPrimary: '#111111',
  textSecondary: '#6e6e73',
  blue: '#111111',
}

const nav = [
  {
    section: 'PLATFORM',
    items: [
      { label: 'Dashboard', href: '/home', icon: <SquaresIcon /> },
    ],
  },
  {
    section: 'APPS',
    items: [
      { label: 'Mansion Nightclub', href: '/mansion/dashboard', icon: <BuildingIcon /> },
    ],
  },
  {
    section: 'ANALYTICS',
    items: [
      { label: 'Overview', href: '/analytics', icon: <BarIcon /> },
      { label: 'Booking Fees', href: '/analytics', icon: <CoinIcon /> },
    ],
  },
  {
    section: 'SETTINGS',
    items: [
      { label: 'Apps & Fees', href: '/apps', icon: <CogIcon /> },
    ],
  },
]

function SquaresIcon() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="0" width="7" height="7" rx="1.5"/><rect x="9" y="0" width="7" height="7" rx="1.5"/><rect x="0" y="9" width="7" height="7" rx="1.5"/><rect x="9" y="9" width="7" height="7" rx="1.5"/></svg>
}
function BuildingIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V7l9-4 9 4v14"/><path d="M9 21V12h6v9"/></svg>
}
function BarIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
}
function CoinIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 9a3 3 0 0 0-5 2.2c0 2 3 2.8 3 4.8a3 3 0 0 1-5 .5"/><line x1="12" y1="6" x2="12" y2="7.5"/><line x1="12" y1="16.5" x2="12" y2="18"/></svg>
}
function CogIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
}
function GearIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
}
function InfoIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
}
function ChevronDown() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
}
function GridSmall() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="0" width="6" height="6" rx="1"/><rect x="10" y="0" width="6" height="6" rx="1"/><rect x="0" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/></svg>
}

function useBreadcrumb(pathname: string) {
  const labels: Record<string, string[]> = {
    '/home': ['Dashboard'],
    '/analytics': ['Analytics'],
    '/apps': ['Apps & Fees'],
    '/mansion/dashboard': ['Mansion Nightclub', 'Dashboard'],
    '/mansion/dashboard/events': ['Mansion Nightclub', 'Events'],
    '/mansion/dashboard/tickets': ['Mansion Nightclub', 'Tickets'],
    '/mansion/dashboard/guestlist': ['Mansion Nightclub', 'Guestlist'],
    '/mansion/dashboard/payouts': ['Mansion Nightclub', 'Payouts'],
    '/mansion/dashboard/notifications': ['Mansion Nightclub', 'Notifications'],
    '/mansion/dashboard/data': ['Mansion Nightclub', 'Customers'],
  }
  return labels[pathname] ?? []
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, profile } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const [showSplash, setShowSplash] = useState(false)
  useEffect(() => {
    if (!sessionStorage.getItem('splash_shown')) {
      sessionStorage.setItem('splash_shown', '1')
      setShowSplash(true)
    }
  }, [])
  const crumbs = useBreadcrumb(pathname)
  const onSplashDone = useCallback(() => setShowSplash(false), [])

  const handleLogout = async () => {
    await logout()
    router.replace('/')
  }

  return (
    <div className="flex min-h-screen" style={{ background: S.bg, fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {showSplash && <SplashScreen onDone={onSplashDone} />}

      {/* ── Sidebar ── */}
      <aside className="flex flex-col shrink-0" style={{ width: 196, background: S.bg, borderRight: `1px solid ${S.border}` }}>

        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <Link href="/home" style={{ display: 'block' }}>
            <Image src="/connect-logo.png" alt="WeConnect" width={160} height={42} style={{ width: 160, height: 'auto' }} priority />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex flex-col flex-1 px-3 gap-4 overflow-y-auto pb-4">
          {nav.map(group => (
            <div key={group.section}>
              <div className="px-2 mb-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
                style={{ color: S.sectionLabel }}>
                {group.section}
              </div>
              {group.items.map(item => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link key={item.label + item.href} href={item.href}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-all mb-0.5"
                    style={{
                      background: active ? S.navActiveBg : 'transparent',
                      color: active ? S.navActive : S.navInactive,
                    }}>
                    {item.icon}
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Profile */}
        <div className="px-3 pb-4 pt-3" style={{ borderTop: `1px solid ${S.border}` }}>
          <div className="relative">
            <button
              onClick={() => setProfileOpen(p => !p)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-all text-left"
              style={{ background: profileOpen ? '#f0f0f2' : 'transparent' }}>
              <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold"
                style={{ background: '#111111', color: '#fff' }}>
                {profile?.firstName?.[0] ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate" style={{ color: S.textPrimary }}>
                  {profile ? `${profile.firstName} ${profile.lastName}` : '…'}
                </div>
                <div className="text-[10px] truncate capitalize" style={{ color: S.sectionLabel }}>
                  {profile?.role ?? ''}
                </div>
              </div>
              <span style={{ color: S.sectionLabel }}><ChevronDown /></span>
            </button>

            {profileOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden shadow-xl"
                style={{ background: '#f0f0f2', border: `1px solid ${S.border}` }}>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-[13px] transition-colors"
                  style={{ color: '#dc2626' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#e5e5ea')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Top bar */}
        <header className="flex items-center justify-between px-6 h-[52px] shrink-0"
          style={{ borderBottom: `1px solid ${S.border}`, background: S.bg }}>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[13px]">
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span style={{ color: '#c7c7cc' }}>›</span>}
                <span style={{ color: i === crumbs.length - 1 ? S.textPrimary : S.navInactive }}>
                  {crumb}
                </span>
              </span>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/home')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
              style={{ background: '#f0f0f2', color: S.textPrimary, border: `1px solid ${S.border}` }}>
              <GridSmall />
              <Image src="/connect-logo.png" alt="WeConnect" width={110} height={24} style={{ width: 110, height: 'auto' }} />
              <ChevronDown />
            </button>
            <button className="w-7 h-7 flex items-center justify-center rounded-md transition-all"
              style={{ color: S.navInactive }}
              onClick={() => router.push('/apps')}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = S.navInactive)}>
              <GearIcon />
            </button>
            <button className="w-7 h-7 flex items-center justify-center rounded-md transition-all"
              style={{ color: S.navInactive }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = S.navInactive)}>
              <InfoIcon />
            </button>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-auto" style={{ background: S.bg }}>
          {children}
        </main>
      </div>
    </div>
  )
}
