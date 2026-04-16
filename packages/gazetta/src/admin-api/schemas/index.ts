/**
 * Barrel for Zod schemas shared between the admin API server and its
 * clients. Importing from `gazetta/admin-api/schemas` avoids pulling
 * in Hono + storage-provider code that live under `gazetta/admin-api`.
 *
 * Migrated endpoints so far: POST /api/pages, POST /api/fragments, and
 * their corresponding list-summary shapes. Add new endpoint modules
 * here as they move to schema-validated contracts.
 */
export * from './pages.js'
export * from './fragments.js'
