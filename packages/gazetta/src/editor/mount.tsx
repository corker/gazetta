import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { EditorMount } from '../types.js'
import type { IChangeEvent } from '@rjsf/core'
import type { WidgetProps } from '@rjsf/utils'

const roots = new WeakMap<HTMLElement, Root>()

const STYLES = `
.gz-editor { font-family: system-ui, -apple-system, sans-serif; font-size: 0.875rem; }
.gz-editor .form-group { margin-bottom: 1rem; }
.gz-editor label { display: block; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: #a0a0a0; margin-bottom: 0.25rem; }
.gz-editor .field-description { font-size: 0.75rem; color: #888; margin-bottom: 0.375rem; }
.gz-editor input[type="text"], .gz-editor input[type="number"], .gz-editor input[type="url"],
.gz-editor input[type="email"], .gz-editor input[type="password"], .gz-editor input[type="color"],
.gz-editor textarea, .gz-editor select {
  width: 100%; padding: 0.5rem 0.625rem; font-size: 0.875rem; font-family: inherit;
  background: #1e1e2e; color: #e0e0e0; border: 1px solid #3a3a4a; border-radius: 6px;
  outline: none; transition: border-color 0.15s;
}
.gz-editor input:focus, .gz-editor textarea:focus, .gz-editor select:focus {
  border-color: #667eea;
}
.gz-editor textarea { min-height: 5rem; resize: vertical; }
.gz-editor .btn { display: none; }
.gz-editor .error-detail, .gz-editor .text-danger { color: #f87171; font-size: 0.75rem; }
.gz-editor .array-item { padding: 0.5rem; border: 1px solid #2a2a3a; border-radius: 6px; margin-bottom: 0.5rem; }
.gz-editor .array-item-toolbox { display: flex; gap: 0.25rem; margin-top: 0.375rem; }
.gz-editor .array-item-toolbox .btn { display: inline-flex; padding: 0.25rem 0.5rem; font-size: 0.75rem; background: #2a2a3a; color: #ccc; border: none; border-radius: 4px; cursor: pointer; }
.gz-editor .array-item-toolbox .btn:hover { background: #3a3a4a; }
.gz-editor .markdown-widget textarea { min-height: 12rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.8125rem; line-height: 1.6; }
.gz-editor .markdown-widget .markdown-hint { font-size: 0.6875rem; color: #52525b; margin-top: 0.25rem; }
`

/** Markdown widget — textarea with monospace font and hint */
function MarkdownWidget(props: WidgetProps) {
  return (
    <div className="markdown-widget">
      <textarea
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        rows={(props.schema as Record<string, unknown>).rows as number ?? 12}
      />
      <div className="markdown-hint">Markdown supported</div>
    </div>
  )
}

const customWidgets = {
  markdown: MarkdownWidget,
}

export function createEditorMount(jsonSchema: object): EditorMount {
  return {
    mount(el, { content, onChange }) {
      const existing = roots.get(el)
      if (existing) existing.unmount()

      const root = createRoot(el)
      roots.set(el, root)

      function EditorForm() {
        const [formData, setFormData] = React.useState(content)

        const handleChange = (e: IChangeEvent) => {
          setFormData(e.formData)
          onChange(e.formData as Record<string, unknown>)
        }

        return (
          <>
            <style>{STYLES}</style>
            <div className="gz-editor">
              <Form
                schema={jsonSchema as Record<string, unknown>}
                uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
                formData={formData}
                onChange={handleChange}
                validator={validator}
                widgets={customWidgets}
                liveValidate
                omitExtraData
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
