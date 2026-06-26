import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp() {
  if (getApps().length) return getApp()
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

function getDb() {
  return getFirestore(getAdminApp())
}

export const db = {
  collection: (name: string) => getDb().collection(name),
  batch: () => getDb().batch(),
}
