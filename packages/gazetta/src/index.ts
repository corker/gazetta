// Types (public API)
export type {
  RenderOutput,
  TemplateFunction,
  EditorMount,
  TemplateModule,
  ComponentManifest,
  FragmentManifest,
  PageManifest,
  SiteManifest,
  ResolvedComponent,
  TargetConfig,
  DirEntry,
  StorageProvider,
  PublishedPageManifest,
  PublishedComponent,
  PurgeStrategy,
} from './types.js'

// Renderer
export { renderComponent, renderPage } from './renderer.js'
export { resolvePage, resolveComponent } from './resolver.js'
export { loadSite } from './site-loader.js'
export type { Site } from './site-loader.js'
export { loadTemplate, invalidateTemplate, invalidateAllTemplates } from './template-loader.js'
export { scopeHtml, scopeCss, generateScopeId, resetScopeCounter } from './scope.js'
export { createApp } from './app.js'

// Storage providers
export { createFilesystemProvider } from './providers/filesystem.js'
export { createAzureBlobProvider } from './providers/azure-blob.js'
export type { AzureBlobProviderOptions } from './providers/azure-blob.js'
export { createS3Provider } from './providers/s3.js'
export type { S3ProviderOptions } from './providers/s3.js'

// Targets
export { createTargetProvider, createTargetRegistry } from './targets.js'

// Publish
export { publishItems, resolveDependencies } from './publish.js'
export { publishPageRendered, publishFragmentRendered, publishSiteManifest, publishFragmentIndex, publishFragmentWithPurge, publishPageWithPurge, createWorkerPurge } from './publish-rendered.js'

// Format helpers
export { format } from './formats.js'

// Editor
export { createEditorMount } from './editor/mount.js'
