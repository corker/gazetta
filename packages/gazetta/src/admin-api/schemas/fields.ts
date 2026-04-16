/**
 * Zod schemas for /api/fields list endpoint.
 */
import { z } from 'zod'

/** Summary used in list responses (GET /api/fields). */
export const FieldSummarySchema = z.object({
  name: z.string(),
  /** Absolute filesystem path to the field source file. */
  path: z.string(),
})
export type FieldSummary = z.infer<typeof FieldSummarySchema>
