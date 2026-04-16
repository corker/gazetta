/**
 * Custom editor for the "hero" template.
 * Demonstrates: live preview + embedded DefaultEditorForm + theme-aware styling.
 */
import React, { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DefaultEditorForm } from 'gazetta/editor'
import type { EditorMount } from 'gazetta/types'

interface HeroContent {
  title?: string
  subtitle?: string
}

function HeroEditor({
  content,
  schema,
  onChange,
  theme,
}: {
  content: HeroContent
  schema: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
  theme: 'dark' | 'light'
}) {
  const [data, setData] = useState<HeroContent>(content)

  const handleChange = (c: Record<string, unknown>) => {
    setData(c as HeroContent)
    onChange(c)
  }

  return (
    <div>
      {/* Live preview */}
      <div
        style={{
          padding: '1.5rem',
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          borderRadius: '8px',
          marginBottom: '1rem',
          color: '#fff',
          textAlign: 'center' as const,
        }}
      >
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{data.title || 'Untitled'}</h2>
        {data.subtitle && <p style={{ fontSize: '1rem', opacity: 0.85, margin: 0 }}>{data.subtitle}</p>}
      </div>

      {/* Default form below */}
      <DefaultEditorForm schema={schema} content={data as Record<string, unknown>} onChange={handleChange} />
    </div>
  )
}

const roots = new WeakMap<HTMLElement, Root>()

const editor: EditorMount = {
  mount(el, props) {
    const root = createRoot(el)
    roots.set(el, root)
    root.render(
      <HeroEditor
        content={props.content as HeroContent}
        schema={props.schema}
        onChange={props.onChange}
        theme={props.theme}
      />,
    )
  },
  unmount(el) {
    roots.get(el)?.unmount()
    roots.delete(el)
  },
}

export default editor
