'use client'

import { useEffect, useState } from 'react'
import { getAllAppConfigs, saveAppConfig, AppConfig } from '@/lib/platform-config'

const GOLD = '#C9A84C'
const CARD = '#ffffff'
const BORDER = '#e5e5ea'
const BLUE = '#111111'

function fmt(pence: number) {
  return '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

const DEFAULT_NEW: Omit<AppConfig, 'id'> = {
  name: '',
  feePercent: 10,
  active: true,
  createdAt: new Date().toISOString(),
  color: '#C9A84C',
}

export default function AppsPage() {
  const [apps, setApps] = useState<AppConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AppConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newApp, setNewApp] = useState({ ...DEFAULT_NEW, id: '' })
  const [error, setError] = useState('')
  const [connectingStripe, setConnectingStripe] = useState<string | null>(null)

  const handleConnectStripe = async (appId: string) => {
    setConnectingStripe(appId)
    try {
      const res = await fetch('/api/stripe/create-account-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setError(data.error ?? 'Failed to start Stripe onboarding')
    } catch {
      setError('Could not connect to Stripe — check your API key')
    } finally {
      setConnectingStripe(null)
    }
  }

  const load = () => {
    setLoading(true)
    getAllAppConfigs()
      .then(list => {
        // Ensure Mansion always appears even before Firestore is seeded
        const hasMansion = list.some(a => a.id === 'mansion')
        if (!hasMansion) {
          list = [{
            id: 'mansion',
            name: 'Mansion Nightclub',
            feePercent: 10,
            active: true,
            createdAt: new Date().toISOString(),
            color: '#C9A84C',
          }, ...list]
        }
        setApps(list)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!editing) return
    if (editing.feePercent < 0 || editing.feePercent > 100) {
      setError('Fee must be between 0% and 100%')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveAppConfig(editing)
      setApps(prev => prev.map(a => a.id === editing.id ? editing : a))
      setEditing(null)
    } catch {
      setError('Failed to save — check your connection')
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async () => {
    if (!newApp.id.trim() || !newApp.name.trim()) {
      setError('App ID and name are required')
      return
    }
    if (apps.some(a => a.id === newApp.id.trim())) {
      setError('An app with this ID already exists')
      return
    }
    if (newApp.feePercent < 0 || newApp.feePercent > 100) {
      setError('Fee must be between 0% and 100%')
      return
    }
    setSaving(true)
    setError('')
    try {
      const config: AppConfig = { ...newApp, id: newApp.id.trim().toLowerCase().replace(/\s+/g, '-'), createdAt: new Date().toISOString() }
      await saveAppConfig(config)
      setApps(prev => [...prev, config])
      setShowNew(false)
      setNewApp({ ...DEFAULT_NEW, id: '' })
    } catch {
      setError('Failed to create app')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: '#f5f5f7' }}>
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Apps & Fees</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>Manage connected apps and their platform fees</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditing(null); setError('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold"
          style={{ background: BLUE, color: '#fff' }}>
          + Add App
        </button>
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          <div className="text-xs" style={{ color: '#6e6e73' }}>Loading…</div>
        ) : (
          <>
            {/* App cards */}
            {apps.map(app => (
              <div key={app.id} className="rounded-xl p-6"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                {editing?.id === app.id ? (
                  /* Edit mode */
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: editing.color || GOLD }} />
                      <span className="text-xs font-semibold text-gray-900">Editing {app.name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#6e6e73' }}>App Name</label>
                        <input
                          value={editing.name}
                          onChange={e => setEditing({ ...editing, name: e.target.value })}
                          className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 outline-none"
                          style={{ background: '#f0f0f2', border: `1px solid #2a2a2a` }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#6e6e73' }}>
                          Platform Fee %
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={editing.feePercent}
                            onChange={e => setEditing({ ...editing, feePercent: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 outline-none pr-8"
                            style={{ background: '#f0f0f2', border: `1px solid #2a2a2a` }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#6e6e73' }}>%</span>
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: '#6e6e73' }}>
                          {editing.feePercent}% of every ticket sale
                        </p>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#6e6e73' }}>Accent Colour</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={editing.color || '#C9A84C'}
                            onChange={e => setEditing({ ...editing, color: e.target.value })}
                            className="rounded h-9 w-12 cursor-pointer"
                            style={{ background: '#f0f0f2', border: `1px solid #2a2a2a`, padding: 2 }}
                          />
                          <span className="text-xs" style={{ color: '#6e6e73' }}>{editing.color}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs" style={{ color: '#6e6e73' }}>Active</label>
                      <button
                        onClick={() => setEditing({ ...editing, active: !editing.active })}
                        className="relative w-10 h-5 rounded-full transition-colors"
                        style={{ background: editing.active ? '#4ade80' : '#333333' }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                          style={{ left: editing.active ? '1.25rem' : '0.125rem' }} />
                      </button>
                    </div>

                    {error && <p className="text-xs text-red-400">{error}</p>}

                    <div className="flex gap-3 pt-2">
                      <button onClick={() => { setEditing(null); setError('') }}
                        className="px-4 py-2 rounded-lg text-xs font-semibold"
                        style={{ background: '#f0f0f2', color: '#6e6e73', border: `1px solid #2a2a2a` }}>
                        Cancel
                      </button>
                      <button onClick={handleSave} disabled={saving}
                        className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                        style={{ background: BLUE, color: '#fff' }}>
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                        style={{ background: '#f0f0f2', border: `1px solid #222` }}>
                        🏛
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{app.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
                            style={{
                              background: app.active ? '#0a2010' : '#2a2a2e',
                              color: app.active ? '#4ade80' : '#555'
                            }}>
                            {app.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: '#6e6e73' }}>ID: {app.id}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Fee display */}
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#6e6e73' }}>Platform Fee</div>
                        <div className="text-xl font-bold" style={{ color: app.color || GOLD }}>
                          {app.feePercent}%
                        </div>
                        <div className="text-[10px]" style={{ color: '#6e6e73' }}>per ticket sold</div>
                      </div>

                      {/* Stripe status */}
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#6e6e73' }}>Stripe Payouts</div>
                        {app.stripeOnboardingComplete ? (
                          <span className="px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider"
                            style={{ background: '#dcfce7', color: '#16a34a' }}>
                            ✓ Connected
                          </span>
                        ) : app.stripeAccountId ? (
                          <button
                            onClick={() => handleConnectStripe(app.id)}
                            disabled={connectingStripe === app.id}
                            className="px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-opacity disabled:opacity-50"
                            style={{ background: '#fff7ed', color: '#ea580c', cursor: 'pointer' }}>
                            {connectingStripe === app.id ? 'Loading…' : '⚠ Resume Setup'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConnectStripe(app.id)}
                            disabled={connectingStripe === app.id}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                            style={{ background: '#635BFF', color: '#fff' }}>
                            {connectingStripe === app.id ? 'Loading…' : 'Connect Stripe'}
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => { setEditing({ ...app }); setShowNew(false); setError('') }}
                        className="px-4 py-2 rounded-lg text-xs font-semibold"
                        style={{ background: '#f0f0f2', color: '#6e6e73', border: `1px solid #2a2a2a` }}>
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* New app form */}
            {showNew && (
              <div className="rounded-xl p-6" style={{ background: CARD, border: `1px dashed #333` }}>
                <div className="text-xs font-semibold text-gray-900 mb-4">New App</div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#6e6e73' }}>App ID</label>
                    <input
                      value={newApp.id}
                      onChange={e => setNewApp({ ...newApp, id: e.target.value })}
                      placeholder="e.g. fabric-london"
                      className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 outline-none"
                      style={{ background: '#f0f0f2', border: `1px solid #2a2a2a` }}
                    />
                    <p className="text-[10px] mt-1" style={{ color: '#6e6e73' }}>Lowercase, no spaces</p>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#6e6e73' }}>App Name</label>
                    <input
                      value={newApp.name}
                      onChange={e => setNewApp({ ...newApp, name: e.target.value })}
                      placeholder="e.g. Fabric London"
                      className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 outline-none"
                      style={{ background: '#f0f0f2', border: `1px solid #2a2a2a` }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#6e6e73' }}>Platform Fee %</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={newApp.feePercent}
                        onChange={e => setNewApp({ ...newApp, feePercent: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 outline-none pr-8"
                        style={{ background: '#f0f0f2', border: `1px solid #2a2a2a` }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#6e6e73' }}>%</span>
                    </div>
                  </div>
                </div>

                {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

                <div className="flex gap-3">
                  <button onClick={() => { setShowNew(false); setError('') }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: '#f0f0f2', color: '#6e6e73', border: `1px solid #2a2a2a` }}>
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={saving}
                    className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                    style={{ background: BLUE, color: '#fff' }}>
                    {saving ? 'Creating…' : 'Create App'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
