/**
 * Zod schemas for /api/targets list endpoint.
 *
 * The literal unions mirror `TargetEnvironment` and `TargetType` in
 * types.ts — keeping them as z.enum here means the wire shape is the
 * authoritative spec and types.ts just re-exports the inferred types.
 * Don't duplicate the literals on the client.
 */
import { z } from 'zod'

export const TargetEnvironmentSchema = z.enum(['local', 'staging', 'production'])
export type TargetEnvironment = z.infer<typeof TargetEnvironmentSchema>

export const TargetTypeSchema = z.enum(['static', 'dynamic'])
export type TargetType = z.infer<typeof TargetTypeSchema>

/** Entry in the list response for GET /api/targets. */
export const TargetInfoSchema = z.object({
  name: z.string(),
  environment: TargetEnvironmentSchema,
  type: TargetTypeSchema,
  editable: z.boolean(),
})
export type TargetInfo = z.infer<typeof TargetInfoSchema>
