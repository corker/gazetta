import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { EditorMount } from '@gazetta/shared'
import type { IChangeEvent } from '@rjsf/core'

const roots = new WeakMap<HTMLElement, Root>()

export function createEditorMount(jsonSchema: object): EditorMount {
  return {
    mount(el, { content, onChange }) {
      // Clean up existing root if re-mounting
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
          <Form
            schema={jsonSchema as Record<string, unknown>}
            formData={formData}
            onChange={handleChange}
            validator={validator}
            liveValidate
            omitExtraData
          >
            <div />
          </Form>
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
