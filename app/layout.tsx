import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'

const monaSans = localFont({
  src: '../public/fonts/MonaSans.woff2',
  variable: '--font-mona-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Connect. — Main Portal',
  description: 'Centralised management portal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${monaSans.variable}`}>
      <body className="min-h-full" style={{ fontFamily: 'var(--font-mona-sans), sans-serif' }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
