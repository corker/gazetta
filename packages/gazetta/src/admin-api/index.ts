import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { StorageProvider, TargetConfig } from '../types.js'
import { authMiddleware } from './middleware/auth.js'
import { siteRoutes } from './routes/site.js'
import { pageRoutes } from './routes/pages.js'
import { fragmentRoutes } from './routes/fragments.js'
import { componentRoutes } from './routes/components.js'
import { templateRoutes } from './routes/templates.js'
import { previewRoutes } from './routes/preview.js'
import { publishRoutes } from './routes/publish.js'
import { fieldRoutes } from './routes/fields.js'

export interface AdminAppOptions {
  siteDir: string
  storage: StorageProvider
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

  app.route('/', siteRoutes(opts.siteDir, opts.storage))
  app.route('/', pageRoutes(opts.siteDir, opts.storage))
  app.route('/', fragmentRoutes(opts.siteDir, opts.storage))
  app.route('/', componentRoutes(opts.siteDir, opts.storage))
  app.route('/', templateRoutes(opts.siteDir, opts.storage))
  app.route('/', previewRoutes(opts.siteDir, opts.storage))
  app.route('/', publishRoutes(opts.siteDir, opts.storage, opts.targets, opts.targetConfigs))
  app.route('/', fieldRoutes(opts.siteDir, opts.storage))

  return app
}
