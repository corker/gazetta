/**
 * Zod schema for /api/dependents — reverse-dependency lookup for the
 * publish UI's fragment-blast-radius preview.
 *
 * The endpoint always returns two string arrays (pages + fragments
 * that reference the queried fragment); a 400 on invalid input is
 * handled separately (not part of the success shape).
 */
import { z } from 'zod'

export const DependentsResponseSchema = z.object({
  pages: z.array(z.string()),
  fragments: z.array(z.string()),
})
export type DependentsResponse = z.infer<typeof DependentsResponseSchema>
