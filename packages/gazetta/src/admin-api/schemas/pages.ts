/**
 * Zod schemas for /api/pages routes — the single source of truth for
 * request/response shapes on that endpoint.
 *
 * Shared across server (routes/pages.ts uses .parse() to validate
 * incoming bodies) and client (apps/admin/src/client/api/client.ts
 * derives types via z.infer) so drift between them is impossible:
 * either one of them fails to compile, or the contract test in
 * apps/admin/tests/api-contract.test.ts surfaces the mismatch.
 *
 * First slice — POST /api/pages only. The rest of the endpoints still
 * use hand-rolled shape checks; migrating them is mechanical and
 * tracked as a follow-up to testing-plan.md Priority 3.2.
 */
import { z } from 'zod'

/** Summary used in list responses (GET /api/pages). */
export const PageSummarySchema = z.object({
  name: z.string(),
  route: z.string(),
  template: z.string(),
})
export type PageSummary = z.infer<typeof PageSummarySchema>

/** Body for POST /api/pages (create). */
export const CreatePageRequestSchema = z.object({
  /** Page name — used as the directory name and identity. Must be non-empty. */
  name: z.string().min(1),
  /** Template name to bind. Must be non-empty. */
  template: z.string().min(1),
  /** Optional initial content; defaults to `{ title: name }` server-side. */
  content: z.record(z.string(), z.unknown()).optional(),
})
export type CreatePageRequest = z.infer<typeof CreatePageRequestSchema>

/** Response for POST /api/pages (create). */
export const CreatePageResponseSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
})
export type CreatePageResponse = z.infer<typeof CreatePageResponseSchema>
