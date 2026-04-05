import { join } from 'node:path'
import type { TemplateFunction, StorageProvider } from '@gazetta/shared'

const cache = new Map<string, TemplateFunction>()

export async function loadTemplate(storage: StorageProvider, templatesDir: string, templateName: string): Promise<TemplateFunction> {
  const cached = cache.get(templateName)
  if (cached) return cached

  const templatePath = join(templatesDir, templateName, 'index.ts')

  if (!await storage.exists(templatePath)) {
    throw new Error(
      `Template "${templateName}" not found. Expected file at ${templatePath}\n` +
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

  const fn = mod.default as TemplateFunction
  if (typeof fn !== 'function') {
    throw new Error(
      `Template "${templateName}" at ${templatePath} does not export a default function. ` +
      `Got ${typeof fn}. Templates must: export default (params) => ({ html, css, js })`
    )
  }

  cache.set(templateName, fn)
  return fn
}

export function invalidateTemplate(templateName: string): void {
  cache.delete(templateName)
}

export function invalidateAllTemplates(): void {
  cache.clear()
}
