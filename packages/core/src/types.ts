/** Output of a rendered component */
export interface RenderOutput {
  html: string
  css: string
  js: string
  head?: string
}

/** Template function signature */
export type TemplateFunction = (params: {
  content?: Record<string, unknown>
  children?: RenderOutput[]
  params?: Record<string, string>
}) => RenderOutput

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

/** Page manifest (routable component) */
export interface PageManifest extends ComponentManifest {
  route: string
  metadata?: Record<string, unknown>
}

/** Target configuration in site.yaml */
export interface TargetConfig {
  type: 'filesystem' | 'azure-blob' | 's3'
  path?: string
  connectionString?: string
  container?: string
  endpoint?: string
  bucket?: string
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
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
}

/** Published page manifest — stored in S3 as pages/<name>.json */
export interface PublishedPageManifest {
  route: string
  metadata?: Record<string, unknown>
  components: string[]
}

/** Published component — stored in S3 as components/<key>.json */
export interface PublishedComponent {
  html: string
  css: string
  js: string
  head?: string
}

/** Purge strategy for cache invalidation */
export interface PurgeStrategy {
  purgeAll(): Promise<void>
  purgeUrls(urls: string[]): Promise<void>
}
