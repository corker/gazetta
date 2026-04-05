import { join } from 'node:path'
import type { TemplateFunction, TemplateModule, StorageProvider } from '@gazetta/shared'

interface LoadedTemplate {
  render: TemplateFunction
  schema: unknown
  editor?: TemplateModule['editor']
}

const cache = new Map<string, LoadedTemplate>()

const TEMPLATE_FILES = ['index.ts', 'index.tsx']

async function findTemplateFile(storage: StorageProvider, templatesDir: string, templateName: string): Promise<string | null> {
  for (const file of TEMPLATE_FILES) {
    const path = join(templatesDir, templateName, file)
    if (await storage.exists(path)) return path
  }
  return null
}

export async function loadTemplate(storage: StorageProvider, templatesDir: string, templateName: string): Promise<LoadedTemplate> {
  const cached = cache.get(templateName)
  if (cached) return cached

  const templatePath = await findTemplateFile(storage, templatesDir, templateName)
  if (!templatePath) {
    throw new Error(
      `Template "${templateName}" not found. Expected index.ts or index.tsx in ${join(templatesDir, templateName)}\n` +
      `  Available templates are in ${templatesDir}`
    )
  }

  let mod: Record<string, unknown>
  try {
    mod = await import(`${templatePath}?t=${Date.now()}`)
  } catch (err) {
    throw new Error(
      `Failed to import template "${templateName}" from ${templatePath}: ${(err as Error).message}`
    )
  }

  const render = mod.default as TemplateFunction
  if (typeof render !== 'function') {
    throw new Error(
      `Template "${templateName}" at ${templatePath} does not export a default function. ` +
      `Got ${typeof render}. Templates must: export default (params) => ({ html, css, js })`
    )
  }

  if (!mod.schema) {
    throw new Error(
      `Template "${templateName}" at ${templatePath} does not export a schema. ` +
      `Templates must: export const schema = z.object({ ... })`
    )
  }

  const loaded: LoadedTemplate = {
    render,
    schema: mod.schema,
    editor: mod.editor as TemplateModule['editor'],
  }

  cache.set(templateName, loaded)
  return loaded
}

export function invalidateTemplate(templateName: string): void {
  cache.delete(templateName)
}

export function invalidateAllTemplates(): void {
  cache.clear()
}
