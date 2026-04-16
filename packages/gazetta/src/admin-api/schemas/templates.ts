/**
 * Zod schemas for /api/templates list endpoint.
 *
 * Scope note: GET /api/templates/:name/schema returns a spread JSON
 * Schema with `hasEditor`/`editorUrl`/`fieldsBaseUrl` siblings — that
 * wire shape is awkward to validate against a static Zod schema
 * because the JSON Schema payload is arbitrary. Migrating it is a
 * separate slice that should come with reshaping the response into
 * a proper `{ jsonSchema, ... }` envelope.
 */
import { z } from 'zod'

/** Summary used in list responses (GET /api/templates). */
export const TemplateSummarySchema = z.object({
  name: z.string(),
})
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>
