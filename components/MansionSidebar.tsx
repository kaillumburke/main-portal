'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const nav = [
  {
    label: 'Events',
    icon: '📅',
    children: [
      { href: '/mansion/dashboard', label: 'Dashboard' },
      { href: '/mansion/dashboard/events', label: 'Add / View Events' },
    ],
  },
  {
    label: 'Tickets',
    icon: '🎟',
    children: [
      { href: '/mansion/dashboard/tickets', label: 'View Tickets' },
    ],
  },
  {
    label: 'Guestlist',
    icon: '✦',
    children: [
      { href: '/mansion/dashboard/guestlist', label: 'View Guestlist' },
    ],
  },
  {
    label: 'Revenue',
    icon: '£',
    children: [
      { href: '/mansion/dashboard/payouts', label: 'Payouts' },
    ],
  },
  {
    label: 'Refunds',
    icon: '↩',
    children: [
      { href: '/mansion/dashboard/refunds', label: 'Refund Requests' },
    ],
  },
  {
    label: 'Notifications',
    icon: '🔔',
    children: [
      { href: '/mansion/dashboard/notifications', label: 'Send Push' },
    ],
  },
  {
    label: 'Data',
    icon: '◈',
    children: [
      { href: '/mansion/dashboard/data', label: 'Customers' },
    ],
  },
  {
    label: 'Sign Up Links',
    icon: '🔗',
    children: [
      { href: '/mansion/dashboard/signups', label: 'Manage Links' },
    ],
  },
]

export default function MansionSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<string[]>([])

  const toggle = (label: string) => {
    setCollapsed(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
  }

  return (
    <aside className="flex flex-col w-52 shrink-0 py-6"
      style={{ background: '#f5f5f7', borderRight: '1px solid #e5e5ea' }}>

      <div className="px-5 mb-6">
        <div className="text-xs font-bold tracking-widest uppercase text-gray-900">Mansion</div>
        <div className="text-[9px] tracking-[0.3em] uppercase mt-0.5" style={{ color: '#6e6e73' }}>Nightclub Liverpool</div>
      </div>

      <nav className="flex flex-col flex-1 gap-0.5 px-2">
        {nav.map(section => {
          const isOpen = !collapsed.includes(section.label)
          const hasActive = section.children.some(c => c.href === pathname)
          return (
            <div key={section.label}>
              <button
                onClick={() => toggle(section.label)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors"
                style={{ color: hasActive ? '#111111' : '#6e6e73' }}>
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
                        className="flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: active ? '#111111' : 'transparent',
                          color: active ? '#ffffff' : '#6e6e73',
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
    </aside>
  )
}
