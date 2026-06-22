import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface AppConfig {
  id: string
  name: string
  feePercent: number              // e.g. 10 = 10%
  active: boolean
  createdAt: string
  color?: string                  // accent colour for branding
  stripeAccountId?: string        // Stripe Connect Express account ID
  stripeOnboardingComplete?: boolean
  stripeChargesEnabled?: boolean
  stripePayoutsEnabled?: boolean
}

const COL = 'platform_apps'

export async function getAppConfig(appId: string): Promise<AppConfig | null> {
  const snap = await getDoc(doc(db, COL, appId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as AppConfig
}

export async function getAllAppConfigs(): Promise<AppConfig[]> {
  const snap = await getDocs(collection(db, COL))
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppConfig))
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  const { id, ...data } = config
  await setDoc(doc(db, COL, id), data, { merge: true })
}

// Seed default config for Mansion if it doesn't exist yet
export async function ensureMansionConfig(): Promise<AppConfig> {
  const existing = await getAppConfig('mansion')
  if (existing) return existing
  const config: AppConfig = {
    id: 'mansion',
    name: 'Mansion Nightclub',
    feePercent: 10,
    active: true,
    createdAt: new Date().toISOString(),
    color: '#C9A84C',
  }
  await saveAppConfig(config)
  return config
}
