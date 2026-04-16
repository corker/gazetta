import { Hono } from 'hono'
import { join } from 'node:path'
import { logger } from 'hono/logger'
import type { StorageProvider, TargetConfig } from '../types.js'
import { scanTemplates } from '../templates-scan.js'
import { memoizeAsync } from '../concurrency.js'
import { createSourceSidecarWriter, type SourceSidecarWriter } from '../source-sidecars.js'
import { createContentRoot } from '../content-root.js'
import { createTargetRegistryView } from '../targets.js'
import { createSourceContext, staticSourceResolver, registrySourceResolver, type SourceContext, type SourceContextResolver } from './source-context.js'
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
      contentRoot: opts.source.contentRoot,
      scanTemplates: () => cachedScan.get(),
      templatesDir,
    })
    if (!opts.source.sidecarWriter) {
      source = { ...opts.source, sidecarWriter }
    }
  } else {
    if (!opts.storage) {
      throw new Error('createAdminApp: either `source` or `storage` must be provided')
    }
    const bootstrapRoot = createContentRoot(opts.storage, opts.siteDir)
    sidecarWriter = createSourceSidecarWriter({
      contentRoot: bootstrapRoot,
      scanTemplates: () => cachedScan.get(),
      templatesDir,
    })
    source = createSourceContext({
      storage: opts.storage,
      siteDir: opts.siteDir,
      sidecarWriter,
    })
  }

  // Build the per-request source resolver. When target configs are
  // declared, routes honor `?target=<name>` to read from any known
  // target. Providers are initialized lazily so dev startup doesn't
  // pay the cost of connecting every cloud target just to serve the
  // editable local one.
  //
  // Without target configs (tests, single-target setups), the resolver
  // is static — always returns the bootstrap source.
  let resolveSource: SourceContextResolver
  if (opts.targetConfigs && Object.keys(opts.targetConfigs).length > 0) {
    // Start with whatever pre-initialized providers the caller supplied
    // (typically the editable source target from bootstrap). Missing
    // providers are built on demand via lazyInit below.
    const providers = new Map(opts.targets ?? [])
    const registry = createTargetRegistryView(providers, opts.targetConfigs)
    resolveSource = registrySourceResolver({
      registry,
      projectSiteDir: source.projectSiteDir,
      sidecarWriter,
      // The registry's filesystem targets are already content-rooted
      // (path=./targets/<key>); siteDir on the resolved context is empty.
      siteDir: '',
      lazyInit: async (name) => {
        const config = opts.targetConfigs![name]
        if (!config) return
        const { createStorageProvider } = await import('../targets.js')
        const storage = await createStorageProvider(config.storage, source.projectSiteDir, name)
        const maybeInit = storage as StorageProvider & { init?: () => Promise<void> }
        if (typeof maybeInit.init === 'function') await maybeInit.init()
        providers.set(name, storage)
      },
    })
  } else {
    resolveSource = staticSourceResolver(source)
  }

  app.route('/', siteRoutes(resolveSource))
  app.route('/', pageRoutes(resolveSource))
  app.route('/', fragmentRoutes(resolveSource))
  app.route('/', templateRoutes(resolveSource, templatesDir, adminDir, opts.production))
  app.route('/', previewRoutes(resolveSource, templatesDir))
  app.route('/', publishRoutes(resolveSource, opts.targets, opts.targetConfigs, templatesDir, scan))
  app.route('/', compareRoutes(resolveSource, opts.targets, opts.targetConfigs, templatesDir, scan))
  app.route('/', fieldRoutes(resolveSource, adminDir))

  // Exposed for the CLI's template file watcher: clears the memoized scan
  // so the next publish/compare picks up template edits. Not part of the
  // Hono Request interface — the CLI casts the return.
  const appWithInvalidate = app as AdminApp
  appWithInvalidate.invalidateTemplatesCache = () => cachedScan.invalidate()
  appWithInvalidate.invalidateSourceSidecars = () => sidecarWriter.invalidate()
  appWithInvalidate.writeSourceSidecar = (kind, name) => sidecarWriter.writeFor(kind, name)
  return appWithInvalidate
}
