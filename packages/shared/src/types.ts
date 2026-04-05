/** Output of a rendered component */
export interface RenderOutput {
  html: string
  css: string
  js: string
}

/** Template function signature */
export type TemplateFunction = (params: {
  content?: Record<string, unknown>
  children?: RenderOutput[]
  params?: Record<string, string>
}) => RenderOutput

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

/** Site manifest (site.yaml) */
export interface SiteManifest {
  name: string
  version?: string
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
}

/** Resolved component ready for rendering */
export interface ResolvedComponent {
  template: TemplateFunction
  content?: Record<string, unknown>
  children: ResolvedComponent[]
}
