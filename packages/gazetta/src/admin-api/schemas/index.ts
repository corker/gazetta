/**
 * Barrel for Zod schemas shared between the admin API server and its
 * clients. Importing from `gazetta/admin-api/schemas` avoids pulling
 * in Hono + storage-provider code that live under `gazetta/admin-api`.
 *
 * First slice covers only POST /api/pages. Add new endpoint modules
 * here as they migrate to schema-validated contracts.
 */
export * from './pages.js'
