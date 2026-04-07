import { marked } from 'marked'
import { z } from 'zod'

/**
 * Process content fields based on schema metadata.
 * Converts markdown fields to HTML before passing to templates.
 */
export function processContent(
  content: Record<string, unknown> | undefined,
  schema: unknown
): Record<string, unknown> | undefined {
  if (!content || !schema) return content

  let jsonSchema: Record<string, unknown>
  try {
    jsonSchema = z.toJSONSchema(schema as z.ZodType) as Record<string, unknown>
  } catch {
    return content
  }

  const properties = jsonSchema.properties as Record<string, Record<string, unknown>> | undefined
  if (!properties) return content

  const processed = { ...content }
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.format === 'markdown' && typeof processed[key] === 'string') {
      processed[key] = marked(processed[key] as string)
    }
  }
  return processed
}
