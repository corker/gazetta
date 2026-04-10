/**
 * Format helpers for Zod schema `.meta()`.
 *
 * Usage:
 *   import { format } from 'gazetta'
 *   z.string().meta(format.markdown())
 *
 * The format flows through: Zod → JSON Schema → @rjsf → widget.
 * Built-in @rjsf formats (textarea, email, color, etc.) work out of the box.
 * Custom formats (markdown) need a registered widget in the editor.
 */

export const format = {
  /** Multiline text editor */
  textarea: (opts?: { rows?: number }) => ({ format: 'textarea' as const, ...opts }),

  /** Markdown editor with preview */
  markdown: (opts?: { toolbar?: string[] }) => ({ format: 'markdown' as const, ...opts }),

  /** Email input with validation */
  email: () => ({ format: 'email' as const }),

  /** URL input */
  uri: () => ({ format: 'uri' as const }),

  /** Date picker */
  date: () => ({ format: 'date' as const }),

  /** Date and time picker */
  datetime: () => ({ format: 'date-time' as const }),

  /** Time picker */
  time: () => ({ format: 'time' as const }),

  /** Color picker */
  color: () => ({ format: 'color' as const }),

  /** Password input (masked) */
  password: () => ({ format: 'password' as const }),

  /** File upload */
  file: () => ({ format: 'data-url' as const }),

  /** Rich text editor (Tiptap) */
  richtext: () => ({ format: 'richtext' as const }),

  /** Image URL with preview thumbnail */
  image: () => ({ format: 'image' as const }),

  /** Link — URL + optional label + target */
  link: () => ({ format: 'link' as const }),

  /** Slug — auto-generated URL-safe identifier */
  slug: () => ({ format: 'slug' as const }),

  /** Code editor with syntax highlighting */
  code: (opts?: { language?: string }) => ({ format: 'code' as const, ...opts }),

  /** JSON editor with validation */
  json: () => ({ format: 'json' as const }),
}
