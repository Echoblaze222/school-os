'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { GridIcon, PlusIcon, XIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import styles from '../nurse.module.css'
import motion from '@/components/dashboard-motion.module.css'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

interface Props { profile: any; school: any; userId: string }

export default function InventoryClient({ profile, school, userId }: Props) {
  const { toast, showToast } = useToast()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restockingId, setRestockingId] = useState<string | null>(null)

  const [itemName, setItemName] = useState('')
  const [category, setCategory] = useState('')
  const [quantityOnHand, setQuantityOnHand] = useState('')
  const [unit, setUnit] = useState('units')
  const [reorderLevel, setReorderLevel] = useState('5')

  async function loadItems() {
    setLoading(true)
    try {
      const res = await fetch('/api/nurse/inventory')
      const json = await res.json()
      setItems(json.ok ? json.items : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadItems() }, [])

  // Stock counts double-decrement if two nurses dispense without
  // seeing each other's updates.
  useRealtimeRefresh({ tables: ['clinic_inventory'], onChange: loadItems })


  async function submitItem() {
    if (!itemName.trim()) { showToast('Item name is required.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/nurse/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName, category, quantityOnHand: Number(quantityOnHand || 0), unit, reorderLevel: Number(reorderLevel || 5) }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not add item.'); return }
      showToast('Item added.')
      setShowForm(false); setItemName(''); setCategory(''); setQuantityOnHand(''); setUnit('units'); setReorderLevel('5')
      loadItems()
    } finally { setSaving(false) }
  }

  async function adjustQuantity(id: string, delta: number, current: number) {
    setRestockingId(id)
    try {
      const res = await fetch('/api/nurse/inventory', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quantityOnHand: Math.max(0, current + delta) }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not update.'); return }
      loadItems()
    } finally { setRestockingId(null) }
  }

  return (
    <RolePageWrapper userId={userId} role="nurse" profile={profile} school={school} title="Clinic Inventory">
      <main className={styles.main}>
        <ActionButton onClick={() => setShowForm(true)} icon={<PlusIcon size={16} />} fullWidth>
          Add Item
        </ActionButton>

        <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-5)' }}>Stock</p>
        {loading ? <SkeletonList count={4} variant="row" /> : items.length === 0 ? (
          <EmptyState icon={<GridIcon size={28} />} title="No inventory items yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(item => {
              const low = item.quantity_on_hand <= item.reorder_level
              return (
                <div key={item.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.86rem', margin: 0 }}>{item.item_name}</p>
                      <p style={{ fontSize: '0.74rem', color: low ? 'var(--status-warn, #E4572E)' : 'var(--text-muted)', margin: '2px 0 0' }}>
                        {item.quantity_on_hand} {item.unit} on hand{low ? ' · Low stock' : ''}{item.category ? ` · ${item.category}` : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => adjustQuantity(item.id, -1, item.quantity_on_hand)} disabled={restockingId === item.id}
                        style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', cursor: 'pointer' }}>-</button>
                      <button onClick={() => adjustQuantity(item.id, 1, item.quantity_on_hand)} disabled={restockingId === item.id}
                        style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }} />
      </main>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Add Inventory Item</p>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Item name" value={itemName} onChange={e => setItemName(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Category (e.g. First Aid)" value={category} onChange={e => setCategory(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <input placeholder="Quantity" type="number" value={quantityOnHand} onChange={e => setQuantityOnHand(e.target.value)}
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <input placeholder="Unit" value={unit} onChange={e => setUnit(e.target.value)}
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              </div>
              <input placeholder="Reorder level" type="number" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <ActionButton onClick={submitItem} loading={saving} loadingLabel="Saving…" fullWidth>Add Item</ActionButton>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </RolePageWrapper>
  )
}
