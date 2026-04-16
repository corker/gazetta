/**
 * Zod schema for POST /api/fetch — pull content from another target
 * into the source target (the cross-target admin copy operation).
 */
import { z } from 'zod'

export const FetchResponseSchema = z.object({
  success: z.boolean(),
  copiedFiles: z.number(),
  items: z.array(z.string()),
})
export type FetchResponse = z.infer<typeof FetchResponseSchema>
