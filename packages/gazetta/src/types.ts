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
  mount(
    el: HTMLElement,
    props: {
      content: Record<string, unknown>
      schema: Record<string, unknown>
      theme: 'dark' | 'light'
      onChange: (content: Record<string, unknown>) => void
      /** Base URL for loading custom field modules (dev mode: /@fs/ path) */
      fieldsBaseUrl?: string
    },
  ): void
  unmount(el: HTMLElement): void
}

/** Mount function for framework-agnostic custom field widgets */
export interface FieldMount {
  mount(
    el: HTMLElement,
    props: {
      value: unknown
      schema: Record<string, unknown>
      theme: 'dark' | 'light'
      onChange: (value: unknown) => void
    },
  ): void
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
  /**
   * Filesystem storage directory, relative to the site directory.
   * Defaults to `./targets/<target-key>` when unset — the target's key in
   * site.yaml maps to a subdirectory under `targets/`. Override for shared
   * drives, external mounts, or existing custom layouts.
   */
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

export type TargetEnvironment = 'local' | 'staging' | 'production'

export type TargetType = 'static' | 'dynamic'

/** Target configuration in site.yaml */
export interface TargetConfig {
  storage: StorageConfig
  worker?: WorkerConfig
  /**
   * Rendering model:
   * - `static`: pre-rendered at publish time, served from edge (no SSR at request)
   * - `dynamic`: composed/SSR'd at request time on Node/Bun server (ESI-style assembly)
   * Default: `dynamic` if worker configured, `static` otherwise.
   */
  type?: TargetType
  /**
   * Semantic intent of this target — drives UI treatment (confirmation
   * prompts, badges) and ops decisions. Default: 'local'. Production
   * targets must be marked explicitly — the default is safe, not
   * alarming; prod opt-in prevents accidental prod chrome on dev targets.
   */
  environment?: TargetEnvironment
  /**
   * Whether the author can save form-edits to this target and whether it
   * can receive publishes from the CMS. Default: `true` for `environment:
   * local` (or unset — local is the env default), `false` for `staging`
   * and `production`.
   * Override explicitly for hotfix-tolerant staging/prod setups
   * (`editable: true`) or locked-down local targets (`editable: false`).
   */
  editable?: boolean
  /** Base URL of the site (e.g. https://gazetta.studio) */
  siteUrl?: string
  cache?: CacheConfig
  /**
   * Per-target history / revisions (undo, rollback). Default: enabled
   * with 50-revision retention. Set `{ enabled: false }` to disable
   * entirely (no `.gazetta/history/` writes on save/publish) for
   * targets where the storage cost isn't worth it (e.g., ephemeral CI
   * preview targets).
   */
  history?: HistoryConfig
}

/** Per-target history configuration. */
export interface HistoryConfig {
  /** Record revisions on save/publish. Default: true. */
  enabled?: boolean
  /**
   * Keep at most N most-recent revisions; oldest evicted on write.
   * Default: 50.
   */
  retention?: number
}

/** Determine rendering type for a target — centralised logic used by CLI and admin API */
export function getType(target: TargetConfig): TargetType {
  return target.type ?? (target.worker ? 'dynamic' : 'static')
}

/** Resolve a target's environment. Defaults to 'local' — production must be explicit. */
export function getEnvironment(target: TargetConfig): TargetEnvironment {
  return target.environment ?? 'local'
}

/**
 * Whether the author can save and receive publishes on this target from the CMS.
 * Default: true for `environment: local`, false for `staging` / `production`.
 */
export function isEditable(target: TargetConfig): boolean {
  return target.editable ?? getEnvironment(target) === 'local'
}

/** Default retention: keep the last 50 revisions. Matches design-publishing.md. */
export const DEFAULT_HISTORY_RETENTION = 50

/** Whether this target records history on save/publish. Default: true. */
export function isHistoryEnabled(target: TargetConfig): boolean {
  return target.history?.enabled ?? true
}

/**
 * Effective retention (max revisions) for this target. Defaults to
 * `DEFAULT_HISTORY_RETENTION`. Values ≤ 0 are clamped to 1 — retaining
 * zero revisions would mean every write evicts itself, which is
 * confusing; use `enabled: false` to disable entirely.
 */
export function getHistoryRetention(target: TargetConfig): number {
  const raw = target.history?.retention ?? DEFAULT_HISTORY_RETENTION
  return raw > 0 ? raw : 1
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
