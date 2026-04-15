import { Hono } from 'hono'
import { join } from 'node:path'
import { logger } from 'hono/logger'
import type { StorageProvider, TargetConfig } from '../types.js'
import { scanTemplates } from '../templates-scan.js'
import { memoizeAsync } from '../concurrency.js'
import { createSourceSidecarWriter, type SourceSidecarWriter } from '../source-sidecars.js'
import { createSourceContext, type SourceContext } from './source-context.js'
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
  /**
   * Pre-built SourceContext — preferred when the caller controls source-content
   * resolution (e.g., derived from a TargetRegistry via createSourceContextFromRegistry).
   * When provided, `storage` is optional (the context carries its own).
   */
  source?: SourceContext
  siteDir: string
  /** Fallback source storage when `source` is not provided. */
  storage?: StorageProvider
  /** Directory containing template packages. Defaults to siteDir/templates. */
  templatesDir?: string
  /** Directory containing admin customizations (editors, fields). Defaults to siteDir/admin. */
  adminDir?: string
  /** Production mode — editors/fields are pre-bundled at /admin/editors/*.js */
  production?: boolean
  /** @deprecated Pre-initialized target providers. Pass `targetConfigs` for lazy init. */
  targets?: Map<string, StorageProvider>
  /** Target configurations — providers are initialized lazily on first publish/fetch/compare. */
  targetConfigs?: Record<string, TargetConfig>
}

type AdminApp = Hono & {
  invalidateTemplatesCache(): void
  invalidateSourceSidecars(): void
  writeSourceSidecar(kind: 'page' | 'fragment', name: string): Promise<void>
}

/**
 * Create an admin API Hono app. Accepts a single options object.
 *
 * Target providers can be supplied either already-initialized via `targets`
 * (legacy), or as configs via `targetConfigs` (lazy init on first use).
 * Exactly one of these is expected when publish/fetch/compare routes are
 * used; both may be present (pre-initialized entries override configs).
 */
export function createAdminApp(opts: AdminAppOptions): AdminApp {
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

  // Prefer an externally-provided SourceContext. Fall back to constructing
  // one from opts.storage + opts.siteDir, which is the legacy shape.
  let source: SourceContext
  let sidecarWriter: SourceSidecarWriter
  if (opts.source) {
    source = opts.source
    sidecarWriter = opts.source.sidecarWriter ?? createSourceSidecarWriter({
      storage: opts.source.storage,
      siteDir: opts.source.siteDir,
      scanTemplates: () => cachedScan.get(),
    })
    // If the provided context had no sidecar writer, wire one for invalidate/write access below.
    if (!opts.source.sidecarWriter) {
      source = { ...opts.source, sidecarWriter }
    }
  } else {
    if (!opts.storage) {
      throw new Error('createAdminApp: either `source` or `storage` must be provided')
    }
    sidecarWriter = createSourceSidecarWriter({
      storage: opts.storage,
      siteDir: opts.siteDir,
      scanTemplates: () => cachedScan.get(),
    })
    source = createSourceContext({
      storage: opts.storage,
      siteDir: opts.siteDir,
      sidecarWriter,
    })
  }

  app.route('/', siteRoutes(source))
  app.route('/', pageRoutes(source))
  app.route('/', fragmentRoutes(source))
  app.route('/', templateRoutes(source, templatesDir, adminDir, opts.production))
  app.route('/', previewRoutes(source, templatesDir))
  app.route('/', publishRoutes(source, opts.targets, opts.targetConfigs, templatesDir, scan))
  app.route('/', compareRoutes(source, opts.targets, opts.targetConfigs, templatesDir, scan))
  app.route('/', fieldRoutes(source, adminDir))

  // Exposed for the CLI's template file watcher: clears the memoized scan
  // so the next publish/compare picks up template edits. Not part of the
  // Hono Request interface — the CLI casts the return.
  const appWithInvalidate = app as AdminApp
  appWithInvalidate.invalidateTemplatesCache = () => cachedScan.invalidate()
  appWithInvalidate.invalidateSourceSidecars = () => sidecarWriter.invalidate()
  appWithInvalidate.writeSourceSidecar = (kind, name) => sidecarWriter.writeFor(kind, name)
  return appWithInvalidate
}
