/**
 * Contract tests — assert that the client's request/response types agree
 * with the server's Zod schemas at runtime.
 *
 * TypeScript already catches compile-time drift (the client's types come
 * from the same schema file via z.infer). This file catches value-level
 * drift: if a test fixture or a real request ever passes through with
 * a field TypeScript happens to allow (e.g. via `as any` or through an
 * un-typed intermediate), safeParse surfaces it here.
 *
 * Coverage is deliberately narrow — only the endpoints that have been
 * migrated to schema-validated contracts. Follow-ups extend the coverage
 * as each endpoint moves to the new pattern (testing-plan.md Priority 3.2).
 */
import { describe, it, expect } from 'vitest'
import { CreatePageRequestSchema, CreatePageResponseSchema, PageSummarySchema } from 'gazetta/admin-api/schemas'
import type { CreatePageRequest, CreatePageResponse, PageSummary } from 'gazetta/admin-api/schemas'

describe('POST /api/pages contract', () => {
  describe('CreatePageRequest', () => {
    it('accepts the minimal shape the client uses', () => {
      const body: CreatePageRequest = { name: 'home', template: 'page-default' }
      expect(CreatePageRequestSchema.safeParse(body).success).toBe(true)
    })

    it('accepts an optional content field', () => {
      const body: CreatePageRequest = {
        name: 'home',
        template: 'page-default',
        content: { title: 'Home' },
      }
      expect(CreatePageRequestSchema.safeParse(body).success).toBe(true)
    })

    it('rejects empty name', () => {
      const r = CreatePageRequestSchema.safeParse({ name: '', template: 'page-default' })
      expect(r.success).toBe(false)
    })

    it('rejects empty template', () => {
      const r = CreatePageRequestSchema.safeParse({ name: 'home', template: '' })
      expect(r.success).toBe(false)
    })

    it('rejects missing required fields', () => {
      expect(CreatePageRequestSchema.safeParse({ name: 'home' }).success).toBe(false)
      expect(CreatePageRequestSchema.safeParse({ template: 'page-default' }).success).toBe(false)
      expect(CreatePageRequestSchema.safeParse({}).success).toBe(false)
    })
  })

  describe('CreatePageResponse', () => {
    it('accepts the response shape the server emits', () => {
      const resp: CreatePageResponse = { ok: true, name: 'home' }
      expect(CreatePageResponseSchema.safeParse(resp).success).toBe(true)
    })

    it('rejects responses missing required fields', () => {
      expect(CreatePageResponseSchema.safeParse({ ok: true }).success).toBe(false)
      expect(CreatePageResponseSchema.safeParse({ name: 'home' }).success).toBe(false)
    })
  })

  describe('PageSummary (GET /api/pages list shape)', () => {
    it('accepts a well-formed entry', () => {
      const entry: PageSummary = { name: 'home', route: '/', template: 'page-default' }
      expect(PageSummarySchema.safeParse(entry).success).toBe(true)
    })

    it('rejects entries missing required fields', () => {
      expect(PageSummarySchema.safeParse({ name: 'home', route: '/' }).success).toBe(false)
    })
  })
})
