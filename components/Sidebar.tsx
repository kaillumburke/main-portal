'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useState } from 'react'

const nav = [
  {
    label: 'Events',
    icon: '📅',
    children: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/dashboard/events', label: 'Add / View Events' },
    ],
  },
  {
    label: 'Tickets',
    icon: '🎟',
    children: [
      { href: '/dashboard/tickets', label: 'View Tickets' },
    ],
  },
  {
    label: 'Guestlist',
    icon: '✦',
    children: [
      { href: '/dashboard/guestlist', label: 'View Guestlist' },
    ],
  },
  {
    label: 'Revenue',
    icon: '£',
    children: [
      { href: '/dashboard/payouts', label: 'Payouts' },
    ],
  },
  {
    label: 'Notifications',
    icon: '🔔',
    children: [
      { href: '/dashboard/notifications', label: 'Send Push' },
    ],
  },
  {
    label: 'Data',
    icon: '◈',
    children: [
      { href: '/dashboard/data', label: 'Customers' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, profile } = useAuth()
  const [collapsed, setCollapsed] = useState<string[]>([])

  const toggle = (label: string) => {
    setCollapsed(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
  }

  const handleLogout = async () => {
    await logout()
    router.replace('/')
  }

  return (
    <aside className="flex flex-col w-52 min-h-screen py-6"
      style={{ background: '#0d0d0d', borderRight: '1px solid #1a1a1a', flexShrink: 0 }}>

      {/* Logo */}
      <div className="px-5 mb-8">
        <img src="/mansion-logo.png" alt="Mansion" style={{ height: 140 }} className="w-auto object-contain" />
        <div className="text-[9px] tracking-[0.3em] uppercase mt-2" style={{ color: '#444' }}>Management Portal</div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col flex-1 gap-0.5 px-2">
        {nav.map(section => {
          const isOpen = !collapsed.includes(section.label)
          const hasActive = section.children.some(c => c.href === pathname)
          return (
            <div key={section.label}>
              <button
                onClick={() => toggle(section.label)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors"
                style={{ color: hasActive ? '#C9A84C' : '#555' }}>
                <span className="flex items-center gap-2">
                  <span>{section.icon}</span>
                  {section.label}
                </span>
                <span style={{ fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="ml-4 flex flex-col gap-0.5 mb-1">
                  {section.children.map(child => {
                    const active = pathname === child.href
                    return (
                      <Link key={child.href} href={child.href}
                        className="flex items-center px-3 py-1.5 rounded-lg text-xs transition-all"
                        style={{
                          background: active ? '#1a1400' : 'transparent',
                          color: active ? '#C9A84C' : '#666',
                          borderLeft: active ? '2px solid #C9A84C' : '2px solid transparent',
                        }}>
                        {child.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 pt-4 mt-4" style={{ borderTop: '1px solid #1a1a1a' }}>
        {profile && (
          <div className="mb-3 px-2">
            <div className="text-xs font-medium text-white">{profile.firstName} {profile.lastName}</div>
            <div className="text-[10px] capitalize" style={{ color: '#C9A84C' }}>{profile.role}</div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{ background: '#1a0a0a', color: '#f87171', border: '1px solid #2a1010' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2e0f0f'; e.currentTarget.style.borderColor = '#3a1515' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1a0a0a'; e.currentTarget.style.borderColor = '#2a1010' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  )
}
