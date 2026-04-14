import React, { useState, useRef, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { FieldMount } from 'gazetta/types'

/** Brand color presets */
const PRESETS = [
  { label: 'Indigo', value: '#667eea' },
  { label: 'Purple', value: '#764ba2' },
  { label: 'Coral', value: '#f97066' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Slate', value: '#475569' },
]

function BrandColorPicker({ value, theme, onChange }: { value: string; theme: 'dark' | 'light'; onChange: (v: string) => void }) {
  const [color, setColor] = useState(value || '#667eea')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setColor(value || '#667eea') }, [value])

  const handleChange = (v: string) => { setColor(v); onChange(v) }

  const isDark = theme === 'dark'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Preview swatch */}
      <div style={{
        height: 48, borderRadius: 8, background: color,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        transition: 'background 0.15s',
      }} />

      {/* Presets */}
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
        {PRESETS.map(p => (
          <button key={p.value} type="button" title={p.label} onClick={() => handleChange(p.value)}
            style={{
              width: 28, height: 28, borderRadius: 6, background: p.value, border: 'none', cursor: 'pointer',
              outline: color === p.value ? `2px solid var(--color-primary)` : 'none',
              outlineOffset: 2, transition: 'outline 0.1s',
            }} />
        ))}
      </div>

      {/* Color input + hex */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input ref={inputRef} type="color" value={color} onChange={e => handleChange(e.target.value)}
          style={{
            width: 36, height: 36, border: `1px solid var(--color-border)`, borderRadius: 6,
            padding: 2, cursor: 'pointer', background: 'transparent',
          }} />
        <input type="text" value={color} onChange={e => handleChange(e.target.value)}
          style={{
            flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontFamily: 'monospace',
            background: `var(--color-input-bg)`,
            color: `var(--color-fg)`,
            border: `1px solid var(--color-border)`,
            borderRadius: 6, outline: 'none',
          }} />
      </div>
    </div>
  )
}

const roots = new WeakMap<HTMLElement, Root>()

const brandColor: FieldMount = {
  mount(el, { value, theme, onChange }) {
    let root = roots.get(el)
    if (!root) { root = createRoot(el); roots.set(el, root) }
    root.render(<BrandColorPicker value={String(value ?? '')} theme={theme} onChange={v => onChange(v)} />)
  },
  unmount(el) {
    const root = roots.get(el)
    if (root) { root.unmount(); roots.delete(el) }
  },
}

export default brandColor
