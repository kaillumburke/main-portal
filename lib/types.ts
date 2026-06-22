export interface FirestoreTicket {
  id: string
  orderId: string
  // Buyer identity
  userId: string
  userEmail: string
  userName: string
  userPhone?: string
  userDOB?: string        // ISO date string e.g. "1998-04-12"
  // Event + tier
  eventId: string
  eventName: string
  tierId: string
  tierName: string
  tierPriceInPence: number
  // Ticket state
  qrCode: string
  status: 'valid' | 'used' | 'cancelled' | 'refunded'
  createdAt: { seconds: number }
  eventDate: { seconds: number }
  doorsOpen?: { seconds: number }
  scannedAt?: { seconds: number }
  // Co-brand API (populated when integrated)
  cobrandRef?: string
}

export interface DBUser {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  dob?: string            // ISO date string e.g. "1998-04-12"
  role: 'admin' | 'customer' | 'doorStaff' | 'dj'
  createdAt: { seconds: number }
}

export interface AppEvent {
  id: string
  name: string
  description: string
  date: { seconds: number }
  endTime?: { seconds: number }
  doorsOpen?: { seconds: number }
  lastEntry?: { seconds: number }
  venue: string
  ageRestriction?: number
  capacity?: number
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED'
  tiers?: TicketTier[]
  headerImageURL?: string
  artworkGradient?: string[]
}

export interface TicketTier {
  id: string
  eventId?: string
  name: string
  priceInPence: number
  allocation: number
  sold: number
  available?: number
  isVisible?: boolean
  description?: string
}

export interface Payout {
  id: string
  promoterId: string
  promoterName: string
  promoterEmail: string
  eventId: string
  eventName: string
  eventDate: { seconds: number }
  amountInPence: number
  status: 'pending' | 'processing' | 'paid'
  paidAt?: { seconds: number }
  notes?: string
}
