/** Output of a rendered component */
export interface RenderOutput {
  html: string
  css: string
  js: string
  head?: string
}

/** Template function signature — generic over content type */
export type TemplateFunction<T extends Record<string, unknown> = Record<string, unknown>> = (params: {
  content?: T
  children?: RenderOutput[]
  params?: Record<string, string>
}) => RenderOutput | Promise<RenderOutput>

/** Mount function for framework-agnostic custom editors */
export interface EditorMount {
  mount(el: HTMLElement, props: { content: Record<string, unknown>; onChange: (content: Record<string, unknown>) => void }): void
  unmount(el: HTMLElement): void
}

/** Template module — what a template file exports */
export interface TemplateModule {
  default: TemplateFunction
  schema: unknown // ZodType — kept as unknown to avoid zod dependency in shared
  editor?: EditorMount
}

/** Component manifest (base) */
export interface ComponentManifest {
  template: string
  content?: Record<string, unknown>
  components?: string[]
}

/** Fragment manifest (shared component) */
export interface FragmentManifest extends ComponentManifest {}

/** Cache configuration */
export interface CacheConfig {
  /** Browser cache TTL in seconds (max-age). Default: 0 */
  browser?: number
  /** Edge/CDN cache TTL in seconds (s-maxage). Default: 86400 */
  edge?: number
}

/** Page manifest (routable component) */
export interface PageManifest extends ComponentManifest {
  route: string
  cache?: CacheConfig
}

/** Storage configuration */
export interface StorageConfig {
  type: 'filesystem' | 'azure-blob' | 's3' | 'r2'
  path?: string
  connectionString?: string
  container?: string
  endpoint?: string
  bucket?: string
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
  accountId?: string
}

/** Worker/runtime configuration */
export interface WorkerConfig {
  type: 'cloudflare'
  name?: string
}

/** Target configuration in site.yaml */
export interface TargetConfig {
  storage: StorageConfig
  worker?: WorkerConfig
  /** Base URL of the site (e.g. https://gazetta.studio) */
  siteUrl?: string
  cache?: CacheConfig
}

/** Site manifest (site.yaml) */
export interface SiteManifest {
  name: string
  version?: string
  targets?: Record<string, TargetConfig>
}

/** Directory entry returned by StorageProvider.readDir */
export interface DirEntry {
  name: string
  isDirectory: boolean
}

/** Storage abstraction — filesystem, S3, Azure Blob, etc. */
export interface StorageProvider {
  readFile(path: string): Promise<string>
  readDir(path: string): Promise<DirEntry[]>
  exists(path: string): Promise<boolean>
  writeFile(path: string, content: string): Promise<void>
  mkdir(path: string): Promise<void>
  rm(path: string): Promise<void>
}

/** Resolved component ready for rendering */
export interface ResolvedComponent {
  template: TemplateFunction
  content?: Record<string, unknown>
  children: ResolvedComponent[]
  path?: string
  /** Component's position in the page tree (e.g., "hero", "@header/logo", "features/fast") */
  treePath?: string
}

/** Purge strategy for cache invalidation */
export interface PurgeStrategy {
  purgeAll(): Promise<void>
  purgeUrls(urls: string[]): Promise<void>
}
