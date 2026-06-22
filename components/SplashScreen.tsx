'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  // phase: 'in' → logo blurs in, 'hold' → crisp, 'out' → fades out
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 50)   // trigger CSS transition
    const t2 = setTimeout(() => setPhase('out'), 1200)  // start fade-out
    const t3 = setTimeout(() => onDone(), 1800)         // unmount
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#ffffff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: phase === 'out' ? 0 : 1,
      transition: phase === 'out' ? 'opacity 0.6s ease' : 'none',
      pointerEvents: 'none',
    }}>
      <div style={{
        filter: phase === 'in' ? 'blur(18px)' : 'blur(0px)',
        opacity: phase === 'in' ? 0 : 1,
        transform: phase === 'in' ? 'scale(1.06)' : 'scale(1)',
        transition: 'filter 0.7s ease, opacity 0.7s ease, transform 0.7s ease',
      }}>
        <Image
          src="/connect-logo.png"
          alt="Connect."
          width={260}
          height={70}
          style={{ width: 260, height: 'auto' }}
          priority
        />
      </div>
    </div>
  )
}
