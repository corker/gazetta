// Types (public API)
export type {
  RenderOutput,
  TemplateFunction,
  EditorMount,
  FieldMount,
  TemplateModule,
  ComponentManifest,
  FragmentManifest,
  PageManifest,
  SiteManifest,
  ResolvedComponent,
  TargetConfig,
  StorageConfig,
  WorkerConfig,
  CacheConfig,
  DirEntry,
  StorageProvider,
  PurgeStrategy,
} from './types.js'
export { getPublishMode } from './types.js'

// Renderer
export { renderComponent, renderFragment, renderPage } from './renderer.js'
export { resolveComponent, resolveFragment, resolvePage } from './resolver.js'
export { loadSite } from './site-loader.js'
export type { Site } from './site-loader.js'
export { loadTemplate, invalidateTemplate, invalidateAllTemplates } from './template-loader.js'
export { scopeHtml, scopeCss, hashPath, generateScopeId, resetScopeCounter } from './scope.js'
export { createApp } from './app.js'

// Storage providers
export { createFilesystemProvider } from './providers/filesystem.js'
export { createAzureBlobProvider } from './providers/azure-blob.js'
export type { AzureBlobProviderOptions } from './providers/azure-blob.js'
export { createS3Provider } from './providers/s3.js'
export type { S3ProviderOptions } from './providers/s3.js'
export { createR2RestProvider } from './providers/r2.js'
export type { R2RestProviderOptions } from './providers/r2.js'

// Targets
export { createStorageProvider, createTargetProvider, createTargetRegistry } from './targets.js'

// Server
export { createServer } from './serve.js'
export type { ServeOptions } from './serve.js'

// Publish
export { publishItems, resolveDependencies } from './publish.js'
export { publishPageRendered, publishPageStatic, publishFragmentRendered, publishSiteManifest, publishFragmentIndex, publishFragmentWithPurge, publishPageWithPurge, createWorkerPurge } from './publish-rendered.js'

// Format helpers
export { format } from './formats.js'

// ESI assembly (for edge workers and servers)
export { assembleEsi, parseCacheComment, splitFragment, findEsiPaths } from './assemble.js'

// Editor — import from 'gazetta/editor' (separate entry point to avoid pulling Tiptap into server builds)
