/**
 * Barrel for Zod schemas shared between the admin API server and its
 * clients. Importing from `gazetta/admin-api/schemas` avoids pulling
 * in Hono + storage-provider code that live under `gazetta/admin-api`.
 *
 * Migrated endpoints so far:
 *   - POST /api/pages (create + list summary)
 *   - POST /api/fragments (create + list summary)
 *   - GET  /api/templates (list)
 *   - GET  /api/fields (list)
 *   - GET  /api/targets (list)
 *   - GET  /api/site (manifest)
 *   - GET  /api/dependents (reverse-dep lookup)
 *
 * Add new endpoint modules here as they move to schema-validated contracts.
 */
export * from './pages.js'
export * from './fragments.js'
export * from './templates.js'
export * from './fields.js'
export * from './targets.js'
export * from './site.js'
export * from './dependents.js'
