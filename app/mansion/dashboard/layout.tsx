'use client'

import MansionSidebar from '@/components/MansionSidebar'

export default function MansionDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0">
      <MansionSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
