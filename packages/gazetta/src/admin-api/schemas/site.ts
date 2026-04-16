/**
 * Zod schemas for /api/site — the site manifest shape as seen by the
 * admin UI.
 *
 * Mirrors what parseSiteManifest() emits plus the empty-target fallback
 * (which includes an otherwise-absent `targets: {}` field).
 */
import { z } from 'zod'

export const SiteManifestSchema = z
  .object({
    name: z.string(),
    version: z.string().optional(),
    locale: z.string().optional(),
    baseUrl: z.string().optional(),
    systemPages: z.array(z.string()).optional(),
  })
  .loose()
export type SiteManifest = z.infer<typeof SiteManifestSchema>
