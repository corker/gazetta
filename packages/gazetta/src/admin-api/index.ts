import { Hono } from 'hono'
import { join } from 'node:path'
import { logger } from 'hono/logger'
import type { StorageProvider, TargetConfig } from '../types.js'
import { scanTemplates } from '../templates-scan.js'
import { memoizeAsync } from '../concurrency.js'
import { createSourceSidecarWriter, type SourceSidecarWriter } from '../source-sidecars.js'
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

type AdminApp = Hono & {
  invalidateTemplatesCache(): void
  invalidateSourceSidecars(): void
}
export function createAdminApp(opts: AdminAppOptions): AdminApp
export function createAdminApp(siteDir: string, storage: StorageProvider, targets?: Map<string, StorageProvider>): AdminApp
export function createAdminApp(
  siteDirOrOpts: string | AdminAppOptions,
  storage?: StorageProvider,
  targets?: Map<string, StorageProvider>
): AdminApp {
  const opts: AdminAppOptions = typeof siteDirOrOpts === 'string'
    ? { siteDir: siteDirOrOpts, storage: storage!, targets }
    : siteDirOrOpts

  const app = new Hono()

  app.use(logger())
  app.use('/api/*', authMiddleware())

  const templatesDir = opts.templatesDir ?? join(opts.siteDir, 'templates')
  const adminDir = opts.adminDir ?? join(opts.siteDir, 'admin')

  // scanTemplates spawns a worker thread per template (jiti import + graph
  // hash). On a 50-template project that's ~5s of CPU on every publish +
  // compare. Memoize at the server lifetime — the CLI's file watcher calls
  // invalidateTemplatesCache() below on any template change.
  //
  // Keyed by (dir, root) as a string; different sites on one server would
  // each get their own cache entry. For now there's only one site per
  // server so a single memoize is enough; swap for a Map<key, Memoized> if
  // we go multi-site per process.
  const cachedScan = memoizeAsync(async () => scanTemplates(templatesDir, opts.siteDir.replace(/[\\/]sites[\\/][^\\/]+$/, '')))
  const scan = (tDir: string, root: string) =>
    tDir === templatesDir ? cachedScan.get() : scanTemplates(tDir, root)

  const sidecarWriter: SourceSidecarWriter = createSourceSidecarWriter({
    storage: opts.storage,
    siteDir: opts.siteDir,
    scanTemplates: () => cachedScan.get(),
  })

  app.route('/', siteRoutes(opts.siteDir, opts.storage))
  app.route('/', pageRoutes(opts.siteDir, opts.storage, sidecarWriter))
  app.route('/', fragmentRoutes(opts.siteDir, opts.storage, sidecarWriter))
  app.route('/', templateRoutes(opts.siteDir, opts.storage, templatesDir, adminDir, opts.production))
  app.route('/', previewRoutes(opts.siteDir, opts.storage, templatesDir))
  app.route('/', publishRoutes(opts.siteDir, opts.storage, opts.targets, opts.targetConfigs, templatesDir, scan))
  app.route('/', compareRoutes(opts.siteDir, opts.storage, opts.targets, opts.targetConfigs, templatesDir, scan))
  app.route('/', fieldRoutes(opts.siteDir, opts.storage, adminDir))

  // Exposed for the CLI's template file watcher: clears the memoized scan
  // so the next publish/compare picks up template edits. Not part of the
  // Hono Request interface — the CLI casts the return.
  const appWithInvalidate = app as AdminApp
  appWithInvalidate.invalidateTemplatesCache = () => cachedScan.invalidate()
  appWithInvalidate.invalidateSourceSidecars = () => sidecarWriter.invalidate()
  return appWithInvalidate
}
