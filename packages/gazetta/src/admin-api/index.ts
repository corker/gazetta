import { Hono } from 'hono'
import { join } from 'node:path'
import { logger } from 'hono/logger'
import type { StorageProvider, TargetConfig } from '../types.js'
import { authMiddleware } from './middleware/auth.js'
import { siteRoutes } from './routes/site.js'
import { pageRoutes } from './routes/pages.js'
import { fragmentRoutes } from './routes/fragments.js'
import { templateRoutes } from './routes/templates.js'
import { previewRoutes } from './routes/preview.js'
import { publishRoutes } from './routes/publish.js'
import { compareRoutes } from './routes/compare.js'
import { fieldRoutes } from './routes/fields.js'

export interface AdminAppOptions {
  siteDir: string
  storage: StorageProvider
  /** Directory containing template packages. Defaults to siteDir/templates. */
  templatesDir?: string
  /** Directory containing admin customizations (editors, fields). Defaults to siteDir/admin. */
  adminDir?: string
  /** Production mode — editors/fields are pre-bundled at /admin/editors/*.js */
  production?: boolean
  /** Pre-initialized targets (legacy) */
  targets?: Map<string, StorageProvider>
  /** Raw target configs — targets will be initialized lazily on first publish/fetch */
  targetConfigs?: Record<string, TargetConfig>
}

export function createAdminApp(opts: AdminAppOptions): Hono
export function createAdminApp(siteDir: string, storage: StorageProvider, targets?: Map<string, StorageProvider>): Hono
export function createAdminApp(
  siteDirOrOpts: string | AdminAppOptions,
  storage?: StorageProvider,
  targets?: Map<string, StorageProvider>
): Hono {
  const opts: AdminAppOptions = typeof siteDirOrOpts === 'string'
    ? { siteDir: siteDirOrOpts, storage: storage!, targets }
    : siteDirOrOpts

  const app = new Hono()

  app.use(logger())
  app.use('/api/*', authMiddleware())

  const templatesDir = opts.templatesDir ?? join(opts.siteDir, 'templates')
  const adminDir = opts.adminDir ?? join(opts.siteDir, 'admin')

  app.route('/', siteRoutes(opts.siteDir, opts.storage))
  app.route('/', pageRoutes(opts.siteDir, opts.storage))
  app.route('/', fragmentRoutes(opts.siteDir, opts.storage))
  app.route('/', templateRoutes(opts.siteDir, opts.storage, templatesDir, adminDir, opts.production))
  app.route('/', previewRoutes(opts.siteDir, opts.storage, templatesDir))
  app.route('/', publishRoutes(opts.siteDir, opts.storage, opts.targets, opts.targetConfigs, templatesDir))
  app.route('/', compareRoutes(opts.siteDir, opts.storage, opts.targets, opts.targetConfigs, templatesDir))
  app.route('/', fieldRoutes(opts.siteDir, opts.storage, adminDir))

  return app
}
