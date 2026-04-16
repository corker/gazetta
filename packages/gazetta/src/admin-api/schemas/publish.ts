/**
 * Zod schemas for /api/publish and /api/publish/stream.
 *
 * PublishResult is the per-target terminal outcome. PublishProgress is
 * the SSE event union streamed from /publish/stream — six discriminated
 * variants keyed by `kind`. Shared with the client so the stream parser
 * can derive its event type via z.infer rather than hand-maintaining a
 * parallel TS union.
 *
 * Reuses InvalidTemplate from compare.ts — same shape in both endpoints.
 */
import { z } from 'zod'
import { InvalidTemplateSchema } from './compare.js'

/** Per-target outcome of a publish action. */
export const PublishResultSchema = z.object({
  target: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  copiedFiles: z.number(),
})
export type PublishResult = z.infer<typeof PublishResultSchema>

/**
 * SSE event variants streamed by POST /api/publish/stream. The server
 * emits events in this order:
 *   start → (target-start → progress* → target-result)+ → done
 * or:
 *   fatal (error anywhere before `done`).
 */
export const PublishProgressSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('start'),
    targets: z.array(z.string()),
    itemsPerTarget: z.number(),
  }),
  z.object({
    kind: z.literal('target-start'),
    target: z.string(),
    total: z.number(),
  }),
  z.object({
    kind: z.literal('progress'),
    target: z.string(),
    current: z.number(),
    total: z.number(),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('target-result'),
    result: PublishResultSchema,
  }),
  z.object({
    kind: z.literal('done'),
    results: z.array(PublishResultSchema),
  }),
  z.object({
    kind: z.literal('fatal'),
    error: z.string(),
    invalidTemplates: z.array(InvalidTemplateSchema).optional(),
  }),
])
export type PublishProgress = z.infer<typeof PublishProgressSchema>
