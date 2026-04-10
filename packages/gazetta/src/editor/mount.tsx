import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import type { EditorMount } from '../types.js'
import type { IChangeEvent } from '@rjsf/core'
import type { WidgetProps, ArrayFieldTemplateProps, ArrayFieldItemTemplateProps, ArrayFieldItemButtonsTemplateProps, ObjectFieldTemplateProps, IconButtonProps } from '@rjsf/utils'

/** Form context passed to all templates and widgets */
interface GzFormContext {
  reorderArray: (fieldPath: string, fromIndex: number, toIndex: number) => void
}

const roots = new WeakMap<HTMLElement, Root>()

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLES = `
/* Base */
.gz-editor { font-family: system-ui, -apple-system, sans-serif; font-size: 0.875rem; color: #e0e0e0; }
.gz-editor * { box-sizing: border-box; }
.gz-editor .form-group { margin-bottom: 1rem; }
.gz-editor label {
  display: block; font-weight: 600; font-size: 0.6875rem; text-transform: uppercase;
  letter-spacing: 0.05em; color: #8888a0; margin-bottom: 0.375rem;
}
.gz-editor .field-description { font-size: 0.75rem; color: #666680; margin-bottom: 0.375rem; line-height: 1.4; }

/* Inputs */
.gz-editor input[type="text"], .gz-editor input[type="number"], .gz-editor input[type="url"],
.gz-editor input[type="email"], .gz-editor input[type="password"],
.gz-editor textarea, .gz-editor select {
  width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; font-family: inherit;
  background: #161622; color: #e0e0e0; border: 1px solid #2a2a3a; border-radius: 6px;
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
}
.gz-editor input:focus, .gz-editor textarea:focus, .gz-editor select:focus {
  border-color: #667eea; box-shadow: 0 0 0 2px #667eea25;
}
.gz-editor textarea { min-height: 5rem; resize: vertical; line-height: 1.5; }
.gz-editor select {
  appearance: none; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 0.75rem center; padding-right: 2rem;
}

/* Hide rjsf chrome */
.gz-editor .btn { display: none; }
.gz-editor fieldset { border: none; padding: 0; margin: 0; }
.gz-editor legend { display: none; }

/* Errors */
.gz-editor .error-detail, .gz-editor .text-danger { color: #f87171; font-size: 0.75rem; margin-top: 0.25rem; }
.gz-editor .has-error input, .gz-editor .has-error textarea, .gz-editor .has-error select { border-color: #f8717180; }

/* Required marker */
.gz-editor label .required { color: #f87171; margin-left: 0.125rem; }

/* ---- Toggle ---- */
.gz-editor .gz-toggle { display: flex; align-items: center; gap: 0.625rem; cursor: pointer; user-select: none; padding: 0.25rem 0; }
.gz-editor .gz-toggle-track {
  position: relative; width: 36px; height: 20px; border-radius: 10px;
  background: #2a2a3a; transition: background 0.2s; flex-shrink: 0;
}
.gz-editor .gz-toggle-track.on { background: #667eea; }
.gz-editor .gz-toggle-thumb {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; transition: transform 0.2s ease;
}
.gz-editor .gz-toggle-track.on .gz-toggle-thumb { transform: translateX(16px); }
.gz-editor .gz-toggle-label { font-size: 0.8125rem; color: #ccc; font-weight: 400; text-transform: none; letter-spacing: 0; }

/* ---- Color ---- */
.gz-editor .gz-color-widget { display: flex; align-items: center; gap: 0.5rem; }
.gz-editor .gz-color-widget input[type="color"] {
  width: 36px; height: 36px; border: 1px solid #2a2a3a; border-radius: 6px;
  padding: 2px; cursor: pointer; background: transparent;
}
.gz-editor .gz-color-widget input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
.gz-editor .gz-color-widget input[type="color"]::-webkit-color-swatch { border-radius: 3px; border: none; }
.gz-editor .gz-color-widget input[type="text"] { flex: 1; }

/* ---- Tags ---- */
.gz-editor .gz-tags {
  display: flex; flex-wrap: wrap; gap: 0.375rem; padding: 0.375rem 0.5rem;
  background: #161622; border: 1px solid #2a2a3a; border-radius: 6px;
  min-height: 2.5rem; align-items: center; cursor: text; transition: border-color 0.15s, box-shadow 0.15s;
}
.gz-editor .gz-tags:focus-within { border-color: #667eea; box-shadow: 0 0 0 2px #667eea25; }
.gz-editor .gz-tag {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.1875rem 0.5rem 0.1875rem 0.625rem;
  background: #252538; border: 1px solid #2a2a3a; border-radius: 4px;
  font-size: 0.8125rem; color: #ccc; transition: background 0.1s;
}
.gz-editor .gz-tag:hover { background: #2a2a40; }
.gz-editor .gz-tag-remove {
  background: none; border: none; color: #666; cursor: pointer; font-size: 1rem;
  padding: 0; line-height: 1; display: flex; align-items: center;
}
.gz-editor .gz-tag-remove:hover { color: #f87171; }
.gz-editor .gz-tags-input {
  border: none !important; background: transparent !important; color: #e0e0e0; font-size: 0.8125rem;
  outline: none !important; min-width: 80px; flex: 1; padding: 0.125rem 0;
  box-shadow: none !important;
}
.gz-editor .gz-tags-empty { color: #444; font-size: 0.75rem; padding: 0.25rem 0; }

/* ---- Image ---- */
.gz-editor .gz-image-preview {
  margin-top: 0.5rem; border-radius: 6px; overflow: hidden;
  background: #161622; border: 1px dashed #2a2a3a; transition: border-color 0.15s;
}
.gz-editor .gz-image-preview.has-image { border-style: solid; }
.gz-editor .gz-image-preview img { display: block; max-width: 100%; max-height: 200px; object-fit: contain; margin: 0 auto; }
.gz-editor .gz-image-preview-empty {
  padding: 2rem; text-align: center; color: #444; font-size: 0.75rem;
}

/* ---- Slug ---- */
.gz-editor .gz-slug-widget input {
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.8125rem; letter-spacing: 0.02em;
}
.gz-editor .gz-slug-hint { font-size: 0.6875rem; color: #444; margin-top: 0.25rem; }

/* ---- Code ---- */
.gz-editor .gz-code-widget textarea {
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.8125rem;
  line-height: 1.6; min-height: 10rem; tab-size: 2;
}
.gz-editor .gz-code-hint { font-size: 0.6875rem; color: #444; margin-top: 0.25rem; }

/* ---- JSON ---- */
.gz-editor .gz-json-widget textarea {
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.8125rem;
  line-height: 1.6; min-height: 8rem; tab-size: 2;
}
.gz-editor .gz-json-error { font-size: 0.6875rem; color: #f87171; margin-top: 0.25rem; }
.gz-editor .gz-json-valid { font-size: 0.6875rem; color: #4ade80; margin-top: 0.25rem; }

/* ---- Markdown ---- */
.gz-editor .gz-markdown textarea {
  min-height: 12rem; font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8125rem; line-height: 1.6;
}
.gz-editor .gz-markdown-hint { font-size: 0.6875rem; color: #444; margin-top: 0.25rem; }

/* ---- Rich text (Tiptap) ---- */
.gz-editor .gz-richtext {
  border: 1px solid #2a2a3a; border-radius: 6px; overflow: hidden;
  background: #161622; transition: border-color 0.15s, box-shadow 0.15s;
}
.gz-editor .gz-richtext:focus-within { border-color: #667eea; box-shadow: 0 0 0 2px #667eea25; }
.gz-editor .gz-richtext-toolbar {
  display: flex; flex-wrap: wrap; gap: 1px; padding: 0.25rem;
  border-bottom: 1px solid #1e1e2e; background: #1a1a2a;
}
.gz-editor .gz-rt-btn {
  background: none; border: 1px solid transparent; border-radius: 4px;
  color: #777; cursor: pointer; padding: 0.3125rem 0.5rem; font-size: 0.6875rem;
  font-family: inherit; line-height: 1; font-weight: 600; transition: all 0.1s;
  display: flex; align-items: center; justify-content: center; min-width: 28px;
}
.gz-editor .gz-rt-btn:hover { color: #ccc; background: #252538; }
.gz-editor .gz-rt-btn.active { color: #667eea; background: #252540; border-color: #667eea30; }
.gz-editor .gz-rt-sep { width: 1px; background: #252538; margin: 0.125rem 0.25rem; align-self: stretch; }

/* Tiptap content area */
.gz-editor .gz-richtext .tiptap { outline: none; padding: 0.75rem; min-height: 10rem; color: #e0e0e0; font-size: 0.875rem; line-height: 1.7; }
.gz-editor .gz-richtext .tiptap p { margin: 0.25rem 0; }
.gz-editor .gz-richtext .tiptap h2 { font-size: 1.25rem; font-weight: 700; margin: 1rem 0 0.25rem; color: #f0f0f0; }
.gz-editor .gz-richtext .tiptap h3 { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0.25rem; color: #e8e8e8; }
.gz-editor .gz-richtext .tiptap ul, .gz-editor .gz-richtext .tiptap ol { padding-left: 1.25rem; margin: 0.25rem 0; }
.gz-editor .gz-richtext .tiptap li { margin: 0.125rem 0; }
.gz-editor .gz-richtext .tiptap blockquote {
  border-left: 3px solid #667eea40; padding-left: 0.875rem; margin: 0.5rem 0;
  color: #999; font-style: italic;
}
.gz-editor .gz-richtext .tiptap code {
  background: #252538; padding: 0.125rem 0.375rem; border-radius: 3px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.8125rem;
}
.gz-editor .gz-richtext .tiptap pre {
  background: #12121e; padding: 0.875rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0;
}
.gz-editor .gz-richtext .tiptap pre code { background: none; padding: 0; }
.gz-editor .gz-richtext .tiptap a { color: #667eea; text-decoration: underline; cursor: pointer; }
.gz-editor .gz-richtext .tiptap hr { border: none; border-top: 1px solid #2a2a3a; margin: 1rem 0; }
.gz-editor .gz-richtext .tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder); float: left; color: #3a3a50; pointer-events: none; height: 0;
}

/* Bubble menu */
.gz-editor .gz-bubble {
  display: flex; gap: 1px; background: #1a1a2e; border: 1px solid #2a2a3a;
  border-radius: 6px; padding: 0.1875rem; box-shadow: 0 4px 16px #0008;
}
.gz-editor .gz-bubble .gz-rt-btn { padding: 0.25rem 0.4375rem; font-size: 0.625rem; }

/* ---- Array ---- */
.gz-editor .gz-array { margin-bottom: 0.25rem; }
.gz-editor .gz-array-header {
  display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; padding-bottom: 0.375rem;
  border-bottom: 1px solid #1e1e2e;
}
.gz-editor .gz-array-title {
  font-size: 0.6875rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: #8888a0;
}
.gz-editor .gz-array-count {
  font-size: 0.625rem; color: #555; background: #1e1e2e;
  padding: 0.0625rem 0.4375rem; border-radius: 8px; font-weight: 600;
}
.gz-editor .gz-array-add {
  margin-left: auto; background: none; border: 1px solid #667eea30;
  color: #667eea; cursor: pointer; font-size: 0.6875rem; font-weight: 600;
  padding: 0.25rem 0.625rem; border-radius: 4px; transition: all 0.15s;
}
.gz-editor .gz-array-add:hover { background: #667eea15; border-color: #667eea50; }
.gz-editor .gz-array-items { display: flex; flex-direction: column; gap: 0.25rem; }

/* Array items — collapsible */
.gz-editor .gz-array-item {
  background: #1a1a28; border-radius: 6px; border: 1px solid #1e1e2e;
  transition: border-color 0.15s;
}
.gz-editor .gz-array-item:hover { border-color: #2a2a3a; }
.gz-editor .gz-array-item.dragging { opacity: 0.9; box-shadow: 0 4px 20px #0006; border-color: #667eea40; }
.gz-editor .gz-array-item-header {
  display: flex; align-items: center; gap: 0.375rem; padding: 0.5rem 0.625rem;
  cursor: pointer; user-select: none; min-height: 36px;
}
.gz-editor .gz-array-item-handle {
  color: #333; font-size: 0.625rem; cursor: grab; flex-shrink: 0; padding: 0.25rem 0.125rem;
  opacity: 0; transition: opacity 0.1s; display: flex; align-items: center; letter-spacing: 1px;
}
.gz-editor .gz-array-item:hover .gz-array-item-handle { opacity: 1; }
.gz-editor .gz-array-item-handle:active { cursor: grabbing; color: #667eea; }
.gz-editor .gz-array-item-chevron {
  color: #444; font-size: 0.5rem; transition: transform 0.15s ease; flex-shrink: 0; width: 12px; text-align: center;
}
.gz-editor .gz-array-item-chevron.open { transform: rotate(90deg); }
.gz-editor .gz-array-item-summary {
  flex: 1; font-size: 0.8125rem; color: #999; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.gz-editor .gz-array-item-summary.empty { color: #444; font-style: italic; }
.gz-editor .gz-array-item-idx {
  font-size: 0.625rem; color: #444; font-weight: 600; flex-shrink: 0;
  min-width: 1rem; text-align: center;
}
.gz-editor .gz-array-item-actions { display: flex; gap: 1px; flex-shrink: 0; opacity: 0; transition: opacity 0.1s; }
.gz-editor .gz-array-item:hover .gz-array-item-actions { opacity: 1; }
.gz-editor .gz-array-item-body {
  padding: 0 0.75rem 0.75rem; overflow: hidden;
  transition: max-height 0.2s ease, opacity 0.15s ease, padding 0.2s ease;
}
.gz-editor .gz-array-item-body.collapsed { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }
.gz-editor .gz-array-item-body.expanded { max-height: 2000px; opacity: 1; }
.gz-editor .gz-array-item-body .form-group:last-child { margin-bottom: 0; }
.gz-editor .gz-array-item-body fieldset > .form-group:last-child { margin-bottom: 0; }

/* Icon buttons */
.gz-editor .gz-btn-icon {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; border-radius: 3px; color: #555; cursor: pointer;
  font-size: 0.6875rem; padding: 0; transition: all 0.1s;
}
.gz-editor .gz-btn-icon:hover { background: #252538; color: #aaa; }
.gz-editor .gz-btn-icon:disabled { opacity: 0.25; cursor: default; }
.gz-editor .gz-btn-icon:disabled:hover { background: transparent; color: #555; }
.gz-editor .gz-btn-icon.gz-btn-remove:hover { background: #2a1a1a; color: #f87171; }

/* Array empty state */
.gz-editor .gz-array-empty {
  padding: 1.5rem; text-align: center; border: 1px dashed #1e1e2e; border-radius: 6px;
  color: #444; font-size: 0.8125rem;
}

/* Nested objects in arrays */
.gz-editor .gz-object-inline { }
.gz-editor .gz-object-inline > .form-group { margin-bottom: 0.625rem; }
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LONG_TEXT_NAMES = new Set(['body', 'description', 'text', 'content', 'bio', 'summary', 'message', 'notes', 'output'])
const URL_NAMES = new Set(['href', 'url', 'link', 'src'])
const COLOR_NAMES = new Set(['background', 'color'])

type JsonSchema = Record<string, unknown>

function buildUiSchema(jsonSchema: JsonSchema): Record<string, unknown> {
  const ui: Record<string, unknown> = { 'ui:submitButtonOptions': { norender: true } }
  const properties = jsonSchema.properties as Record<string, JsonSchema> | undefined
  if (!properties) return ui

  for (const [name, prop] of Object.entries(properties)) {
    const format = prop.format as string | undefined
    const type = prop.type as string | undefined

    if (format === 'markdown' || format === 'richtext' || format === 'image' || format === 'link' || format === 'slug' || format === 'code' || format === 'json') {
      ui[name] = { 'ui:widget': format }
      continue
    }
    if (format === 'color') {
      ui[name] = { 'ui:widget': 'color' }
      continue
    }

    if (type === 'string' && !format) {
      if (LONG_TEXT_NAMES.has(name)) {
        ui[name] = { 'ui:widget': 'textarea', 'ui:options': { rows: 5 } }
      } else if (URL_NAMES.has(name)) {
        ui[name] = { 'ui:options': { inputType: 'url' } }
      } else if (COLOR_NAMES.has(name)) {
        ui[name] = { 'ui:widget': 'color' }
      }
    }

    if (type === 'boolean') {
      ui[name] = { 'ui:widget': 'toggle' }
    }

    if (type === 'array') {
      const items = prop.items as JsonSchema | undefined
      if (items?.type === 'string') {
        ui[name] = { 'ui:widget': 'tags' }
      }
    }
  }

  return ui
}

/** Extract a one-line summary from an array item's formData for the collapsed header */
function summarizeItem(data: unknown): string {
  if (!data || typeof data !== 'object') return String(data ?? '')
  const obj = data as Record<string, unknown>
  // Try common field names that make good summaries
  for (const key of ['title', 'name', 'label', 'heading', 'text', 'quote', 'command']) {
    if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string
  }
  // Fall back to first non-empty string value
  for (const val of Object.values(obj)) {
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return ''
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

function MarkdownWidget(props: WidgetProps) {
  return (
    <div className="gz-markdown">
      <textarea
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="Write markdown here..."
        rows={12}
      />
      <div className="gz-markdown-hint">Markdown supported</div>
    </div>
  )
}

function ToggleWidget(props: WidgetProps) {
  const on = !!props.value
  return (
    <div className="gz-toggle" onClick={() => !props.disabled && !props.readonly && props.onChange(!on)} role="switch" aria-checked={on}>
      <div className={`gz-toggle-track${on ? ' on' : ''}`}>
        <div className="gz-toggle-thumb" />
      </div>
      {props.label && <span className="gz-toggle-label">{props.label}</span>}
    </div>
  )
}

function ColorWidget(props: WidgetProps) {
  const val = props.value ?? ''
  return (
    <div className="gz-color-widget">
      <input type="color" value={val || '#667eea'} onChange={(e) => props.onChange(e.target.value)} />
      <input type="text" value={val} onChange={(e) => props.onChange(e.target.value)} placeholder="#667eea" />
    </div>
  )
}

function TagsWidget(props: WidgetProps) {
  const tags: string[] = Array.isArray(props.value) ? props.value : []
  const [input, setInput] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !tags.includes(trimmed)) props.onChange([...tags, trimmed])
    setInput('')
  }

  const removeTag = (index: number) => props.onChange(tags.filter((_, i) => i !== index))

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags.length - 1)
    }
  }

  return (
    <div className="gz-tags" onClick={() => inputRef.current?.focus()}>
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} className="gz-tag">
          {tag}
          <button type="button" className="gz-tag-remove" onClick={(e) => { e.stopPropagation(); removeTag(i) }} aria-label={`Remove ${tag}`}>&times;</button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="gz-tags-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input) addTag(input) }}
        placeholder={tags.length === 0 ? 'Type and press Enter...' : ''}
      />
    </div>
  )
}

function ImageWidget(props: WidgetProps) {
  const url = props.value ?? ''
  const [broken, setBroken] = React.useState(false)

  React.useEffect(() => { setBroken(false) }, [url])

  return (
    <div>
      <input type="text" value={url} onChange={(e) => props.onChange(e.target.value)} placeholder="https://example.com/image.png" />
      <div className={`gz-image-preview${url && !broken ? ' has-image' : ''}`}>
        {url && !broken
          ? <img src={url} alt="Preview" onError={() => setBroken(true)} />
          : <div className="gz-image-preview-empty">{url ? 'Image failed to load' : 'Paste an image URL above'}</div>
        }
      </div>
    </div>
  )
}

function LinkWidget(props: WidgetProps) {
  return <input type="url" value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value)} placeholder="https://..." />
}

function SlugWidget(props: WidgetProps) {
  const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return (
    <div className="gz-slug-widget">
      <input type="text" value={props.value ?? ''} onChange={(e) => props.onChange(toSlug(e.target.value))} placeholder="my-page-slug" />
      <div className="gz-slug-hint">URL-safe identifier — lowercase, hyphens only</div>
    </div>
  )
}

function CodeWidget(props: WidgetProps) {
  const language = (props.schema as JsonSchema).language as string | undefined
  return (
    <div className="gz-code-widget">
      <textarea value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value)} placeholder={props.placeholder} rows={15} spellCheck={false} />
      {language && <div className="gz-code-hint">{language}</div>}
    </div>
  )
}

function JsonWidget(props: WidgetProps) {
  const [error, setError] = React.useState<string | null>(null)
  const [text, setText] = React.useState(() => {
    if (props.value == null) return ''
    if (typeof props.value === 'string') return props.value
    return JSON.stringify(props.value, null, 2)
  })

  const handleBlur = () => {
    if (!text.trim()) { setError(null); return }
    try {
      JSON.parse(text)
      setError(null)
    } catch {
      setError('Invalid JSON')
    }
  }

  const handleChange = (value: string) => {
    setText(value)
    try {
      const parsed = JSON.parse(value)
      setError(null)
      props.onChange(parsed)
    } catch {
      // Don't set error while typing — only on blur
    }
  }

  return (
    <div className="gz-json-widget">
      <textarea value={text} onChange={(e) => handleChange(e.target.value)} onBlur={handleBlur} placeholder='{ "key": "value" }' rows={10} spellCheck={false} />
      {error && <div className="gz-json-error">{error}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rich Text Widget (Tiptap)
// ---------------------------------------------------------------------------

function RichTextWidget(props: WidgetProps) {
  const onChangeRef = React.useRef(props.onChange)
  onChangeRef.current = props.onChange

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
      }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
    ],
    content: props.value || '',
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getHTML()),
    immediatelyRender: true,
  })

  if (!editor) return null

  const Btn = ({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" className={`gz-rt-btn${active ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); onClick() }}>{children}</button>
  )

  const addLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = prompt('URL:', prev ?? 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="gz-richtext">
      {/* Fixed toolbar */}
      <div className="gz-richtext-toolbar">
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>I</Btn>
        <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>S</Btn>
        <Btn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>&lt;/&gt;</Btn>
        <div className="gz-rt-sep" />
        <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
        <Btn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
        <div className="gz-rt-sep" />
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>&bull;</Btn>
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</Btn>
        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>&ldquo;</Btn>
        <div className="gz-rt-sep" />
        <Btn active={editor.isActive('link')} onClick={addLink}>Link</Btn>
        <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()}>&#x2014;</Btn>
        <Btn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>Code</Btn>
      </div>

      {/* Floating toolbar on selection */}
      <BubbleMenu editor={editor}>
        <div className="gz-bubble">
          <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</Btn>
          <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>I</Btn>
          <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>S</Btn>
          <Btn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>&lt;/&gt;</Btn>
          <Btn active={editor.isActive('link')} onClick={addLink}>Link</Btn>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom Templates
// ---------------------------------------------------------------------------

function GzArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const ctx = props.registry.formContext as GzFormContext | undefined
  const fieldPath = props.fieldPathId?.$id ?? ''

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return
    ctx?.reorderArray(fieldPath, result.source.index, result.destination.index)
  }

  if (props.items.length === 0) {
    return (
      <div className="gz-array">
        <div className="gz-array-header">
          {props.title && <span className="gz-array-title">{props.title}</span>}
          <span className="gz-array-count">0</span>
        </div>
        <div className="gz-array-empty">
          No items yet
          {props.canAdd && (
            <div style={{ marginTop: '0.5rem' }}>
              <button type="button" className="gz-array-add" onClick={props.onAddClick}>+ Add first item</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="gz-array">
      <div className="gz-array-header">
        {props.title && <span className="gz-array-title">{props.title}</span>}
        <span className="gz-array-count">{props.items.length}</span>
        {props.canAdd && <button type="button" className="gz-array-add" onClick={props.onAddClick}>+ Add</button>}
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId={fieldPath || 'array'}>
          {(provided) => (
            <div className="gz-array-items" ref={provided.innerRef} {...provided.droppableProps}>
              {props.items}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  )
}

function GzArrayFieldItemTemplate(props: ArrayFieldItemTemplateProps) {
  const [open, setOpen] = React.useState(true)
  const summary = summarizeItem((props as unknown as { formData: unknown }).formData)
  const draggableId = `${props.buttonsProps.fieldPathId?.$id ?? 'item'}-${props.index}`

  return (
    <Draggable draggableId={draggableId} index={props.index}>
      {(provided, snapshot) => (
        <div
          className={`gz-array-item${snapshot.isDragging ? ' dragging' : ''}`}
          ref={provided.innerRef}
          {...provided.draggableProps}
        >
          <div className="gz-array-item-header" onClick={() => setOpen(!open)}>
            <span
              className="gz-array-item-handle"
              {...provided.dragHandleProps}
              onClick={(e) => e.stopPropagation()}
            >&#x2801;&#x2801;</span>
            <span className={`gz-array-item-chevron${open ? ' open' : ''}`}>&#x25B6;</span>
            <span className="gz-array-item-idx">{props.index + 1}</span>
            {!open && <span className={`gz-array-item-summary${summary ? '' : ' empty'}`}>{summary || 'Empty item'}</span>}
            <div className="gz-array-item-actions" onClick={(e) => e.stopPropagation()}>
              <GzArrayFieldItemButtonsTemplate {...props.buttonsProps} />
            </div>
          </div>
          <div className={`gz-array-item-body ${open ? 'expanded' : 'collapsed'}`}>
            {props.children}
          </div>
        </div>
      )}
    </Draggable>
  )
}

function GzArrayFieldItemButtonsTemplate(props: ArrayFieldItemButtonsTemplateProps) {
  return (
    <>
      {props.hasMoveUp && <button type="button" className="gz-btn-icon" onClick={props.onMoveUpItem} title="Move up">&#x2191;</button>}
      {props.hasMoveDown && <button type="button" className="gz-btn-icon" onClick={props.onMoveDownItem} title="Move down">&#x2193;</button>}
      {props.hasRemove && <button type="button" className="gz-btn-icon gz-btn-remove" onClick={props.onRemoveItem} title="Remove">&times;</button>}
    </>
  )
}

function GzObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const isRoot = props.fieldPathId?.$id === 'root'
  if (isRoot) return <>{props.properties.map((p) => p.content)}</>
  return <div className="gz-object-inline">{props.properties.map((p) => p.content)}</div>
}

function GzAddButton(props: IconButtonProps) {
  return <button type="button" className="gz-array-add" onClick={props.onClick} disabled={props.disabled}>+ Add</button>
}

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

const customWidgets = {
  markdown: MarkdownWidget,
  toggle: ToggleWidget,
  color: ColorWidget,
  tags: TagsWidget,
  richtext: RichTextWidget,
  image: ImageWidget,
  link: LinkWidget,
  slug: SlugWidget,
  code: CodeWidget,
  json: JsonWidget,
}

const customTemplates = {
  ArrayFieldTemplate: GzArrayFieldTemplate,
  ArrayFieldItemTemplate: GzArrayFieldItemTemplate,
  ArrayFieldItemButtonsTemplate: GzArrayFieldItemButtonsTemplate,
  ObjectFieldTemplate: GzObjectFieldTemplate,
  ButtonTemplates: { AddButton: GzAddButton },
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function createEditorMount(jsonSchema: object): EditorMount {
  const uiSchema = buildUiSchema(jsonSchema as JsonSchema)

  return {
    mount(el, { content, onChange }) {
      const existing = roots.get(el)
      if (existing) existing.unmount()

      const root = createRoot(el)
      roots.set(el, root)

      function EditorForm() {
        const [formData, setFormData] = React.useState(content)
        const formDataRef = React.useRef(formData)
        formDataRef.current = formData

        const undoStack = React.useRef<Record<string, unknown>[]>([])
        const redoStack = React.useRef<Record<string, unknown>[]>([])
        const isUndoRedo = React.useRef(false)

        const pushHistory = (prev: Record<string, unknown>) => {
          if (isUndoRedo.current) return
          undoStack.current.push(prev)
          if (undoStack.current.length > 50) undoStack.current.shift()
          redoStack.current = []
        }

        const applyFormData = (data: Record<string, unknown>) => {
          setFormData(data)
          onChange(data)
        }

        const handleChange = (e: IChangeEvent) => {
          pushHistory(formDataRef.current)
          setFormData(e.formData)
          onChange(e.formData as Record<string, unknown>)
        }

        React.useEffect(() => {
          const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
              e.preventDefault()
              if (e.shiftKey) {
                // Redo
                if (redoStack.current.length === 0) return
                const next = redoStack.current.pop()!
                undoStack.current.push(formDataRef.current)
                isUndoRedo.current = true
                applyFormData(next)
                isUndoRedo.current = false
              } else {
                // Undo
                if (undoStack.current.length === 0) return
                const prev = undoStack.current.pop()!
                redoStack.current.push(formDataRef.current)
                isUndoRedo.current = true
                applyFormData(prev)
                isUndoRedo.current = false
              }
            }
          }
          document.addEventListener('keydown', handler)
          return () => document.removeEventListener('keydown', handler)
        }, [])

        const reorderArray = React.useCallback((fieldPath: string, fromIndex: number, toIndex: number) => {
          setFormData((prev: Record<string, unknown>) => {
            pushHistory(prev)
            const parts = fieldPath.replace(/^root_/, '').split('_')
            const key = parts[0]
            const arr = prev[key]
            if (!Array.isArray(arr)) return prev
            const next = [...arr]
            const [moved] = next.splice(fromIndex, 1)
            next.splice(toIndex, 0, moved)
            const updated = { ...prev, [key]: next }
            onChange(updated)
            return updated
          })
        }, [onChange])

        const formContext: GzFormContext = React.useMemo(() => ({ reorderArray }), [reorderArray])

        return (
          <>
            <style>{STYLES}</style>
            <div className="gz-editor">
              <Form
                schema={jsonSchema as JsonSchema}
                uiSchema={uiSchema}
                formData={formData}
                onChange={handleChange}
                validator={validator}
                widgets={customWidgets}
                templates={customTemplates}
                formContext={formContext}
                liveValidate={false}
                omitExtraData
                noHtml5Validate
              />
            </div>
          </>
        )
      }

      root.render(<EditorForm />)
    },

    unmount(el) {
      const root = roots.get(el)
      if (root) {
        root.unmount()
        roots.delete(el)
      }
    },
  }
}
