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
  mount(el: HTMLElement, props: {
    content: Record<string, unknown>
    schema: Record<string, unknown>
    theme: 'dark' | 'light'
    onChange: (content: Record<string, unknown>) => void
    /** Base URL for loading custom field modules (dev mode: /@fs/ path) */
    fieldsBaseUrl?: string
  }): void
  unmount(el: HTMLElement): void
}

/** Mount function for framework-agnostic custom field widgets */
export interface FieldMount {
  mount(el: HTMLElement, props: {
    value: unknown
    schema: Record<string, unknown>
    theme: 'dark' | 'light'
    onChange: (value: unknown) => void
  }): void
  unmount(el: HTMLElement): void
}

/** Template module — what a template file exports */
export interface TemplateModule {
  default: TemplateFunction
  schema: unknown // ZodType — kept as unknown to avoid zod dependency in shared
}

/** Inline component — nested within a page or fragment manifest */
export interface InlineComponent {
  name: string
  template: string
  content?: Record<string, unknown>
  components?: ComponentEntry[]
}

/** A component entry is either a fragment reference string ("@header") or an inline component object */
export type ComponentEntry = string | InlineComponent

/** Component manifest (base) */
export interface ComponentManifest {
  template: string
  content?: Record<string, unknown>
  components?: ComponentEntry[]
}

/** Fragment manifest (shared component) */
export interface FragmentManifest extends ComponentManifest {}

/** CDN cache purge configuration */
export interface PurgeConfig {
  type: 'cloudflare'
  /** API token with cache purge permission — use ${ENV_VAR} syntax */
  apiToken?: string
  /** Zone ID — auto-detected from siteUrl when not set */
  zoneId?: string
}

/** Cache configuration */
export interface CacheConfig {
  /** Browser cache TTL in seconds (max-age). Default: 0 */
  browser?: number
  /** Edge/CDN cache TTL in seconds (s-maxage). Default: 86400 */
  edge?: number
  /** CDN cache purge configuration */
  purge?: PurgeConfig
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
  /** Publish mode — 'esi' for Workers/gazetta serve, 'static' for static hosting. Default: esi if worker configured, static otherwise. */
  publishMode?: 'esi' | 'static'
  /** Base URL of the site (e.g. https://gazetta.studio) */
  siteUrl?: string
  cache?: CacheConfig
}

/** Determine publish mode for a target — centralised logic used by CLI and admin API */
export function getPublishMode(target: TargetConfig): 'esi' | 'static' {
  return target.publishMode ?? (target.worker ? 'esi' : 'static')
}

/** Site manifest (site.yaml) */
export interface SiteManifest {
  name: string
  version?: string
  locale?: string
  baseUrl?: string
  systemPages?: string[]
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
