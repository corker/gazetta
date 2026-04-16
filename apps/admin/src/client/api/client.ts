// API is relative to the CMS base path: /admin/api, /cms/api, or /api
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') + '/api'

/**
 * Active-target provider — injected at app boot. When set, content-reading
 * api calls auto-append `?target=<active>` so the server reads from the
 * target the author is focused on.
 *
 * Kept as an injected function rather than an import to preserve DIP: the
 * api client doesn't depend on the active-target store (the store wires
 * itself in via main.ts).
 */
type ActiveTargetProvider = () => string | null
let activeTargetProvider: ActiveTargetProvider | null = null

/** Wire the api client to read the active target from the provided source. */
export function setActiveTargetProvider(provider: ActiveTargetProvider | null): void {
  activeTargetProvider = provider
}

/**
 * Append `?target=<active>` to a URL path when the active-target provider
 * is set and the path doesn't already specify a target. Query string is
 * added before any existing `#fragment` (none expected in api URLs).
 */
function withActiveTarget(path: string): string {
  const name = activeTargetProvider?.()
  if (!name) return path
  // Skip if caller already set ?target= explicitly (e.g., compare destination)
  if (/[?&]target=/.test(path)) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}target=${encodeURIComponent(name)}`
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem('gazetta_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${withActiveTarget(path)}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

/**
 * POST to /publish/stream and parse SSE events as they arrive. Calls
 * onProgress for every event including the final 'done'. Returns the
 * 'done' event's results once the stream closes. Throws on 'fatal'.
 *
 * EventSource isn't usable here (it only supports GET), so we read the
 * response body as a stream and parse SSE manually.
 */
async function publishStream(
  items: string[],
  targets: string[],
  onProgress: (ev: PublishProgress) => void,
  options?: { source?: string; signal?: AbortSignal },
): Promise<PublishResult[]> {
  const token = sessionStorage.getItem('gazetta_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const body: Record<string, unknown> = { items, targets }
  if (options?.source) body.source = options.source
  const res = await fetch(`${BASE}/publish/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `Stream failed: ${res.status}`)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let results: PublishResult[] = []
  let fatalError: { error: string; invalidTemplates?: { name: string; errors: string[] }[] } | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    // SSE events are separated by blank lines (\n\n)
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const dataLines: string[] = []
      for (const line of raw.split('\n')) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (!dataLines.length) continue
      const ev = JSON.parse(dataLines.join('\n')) as PublishProgress
      onProgress(ev)
      if (ev.kind === 'done') results = ev.results
      else if (ev.kind === 'fatal') fatalError = { error: ev.error, invalidTemplates: ev.invalidTemplates }
    }
  }

  if (fatalError) {
    const err = new Error(fatalError.error) as Error & { invalidTemplates?: { name: string; errors: string[] }[] }
    if (fatalError.invalidTemplates) err.invalidTemplates = fatalError.invalidTemplates
    throw err
  }
  return results
}

// Summary + create request/response types come from the shared schema
// source-of-truth in gazetta/admin-api/schemas. Any drift between these
// and the server's Zod schema is a compile error at build time —
// enforced here rather than at runtime.
import type {
  PageSummary as PageSummaryShape,
  CreatePageRequest as CreatePageRequestShape,
  CreatePageResponse as CreatePageResponseShape,
  FragmentSummary as FragmentSummaryShape,
  CreateFragmentRequest as CreateFragmentRequestShape,
  CreateFragmentResponse as CreateFragmentResponseShape,
} from 'gazetta/admin-api/schemas'
export type PageSummary = PageSummaryShape
export type CreatePageRequest = CreatePageRequestShape
export type CreatePageResponse = CreatePageResponseShape
export type FragmentSummary = FragmentSummaryShape
export type CreateFragmentRequest = CreateFragmentRequestShape
export type CreateFragmentResponse = CreateFragmentResponseShape
export interface TemplateSummary {
  name: string
}
export interface FieldSummary {
  name: string
  path: string
}
export interface SiteManifest {
  name: string
  version?: string
  systemPages?: string[]
}

export interface InlineComponent {
  name: string
  template: string
  content?: Record<string, unknown>
  components?: ComponentEntry[]
}
export type ComponentEntry = string | InlineComponent

export interface PageDetail extends PageSummary {
  content?: Record<string, unknown>
  components?: ComponentEntry[]
  dir: string
}

export interface FragmentDetail extends FragmentSummary {
  content?: Record<string, unknown>
  components?: ComponentEntry[]
  dir: string
}

export type TargetEnvironment = 'local' | 'staging' | 'production'
export type TargetType = 'static' | 'dynamic'
export interface TargetInfo {
  name: string
  environment: TargetEnvironment
  type: TargetType
  editable: boolean
}

export interface PublishResult {
  target: string
  success: boolean
  error?: string
  copiedFiles: number
}
export type PublishProgress =
  | { kind: 'start'; targets: string[]; itemsPerTarget: number }
  | { kind: 'target-start'; target: string; total: number }
  | { kind: 'progress'; target: string; current: number; total: number; label: string }
  | { kind: 'target-result'; result: PublishResult }
  | { kind: 'done'; results: PublishResult[] }
  | { kind: 'fatal'; error: string; invalidTemplates?: { name: string; errors: string[] }[] }

export interface CompareResult {
  added: string[]
  modified: string[]
  deleted: string[]
  unchanged: string[]
  firstPublish: boolean
  invalidTemplates: { name: string; errors: string[] }[]
}

export const api = {
  getSite: () => request<SiteManifest>('/site'),
  /** List pages. Without `target`, uses the active target (auto-appended).
   *  Pass `target` to list from a specific target — used when pre-checking
   *  item availability before switching the active target. */
  getPages: (opts?: { target?: string }) =>
    request<PageSummary[]>(opts?.target ? `/pages?target=${encodeURIComponent(opts.target)}` : '/pages'),
  getPage: (name: string, options?: RequestInit) => request<PageDetail>(`/pages/${name}`, options),
  createPage: (data: CreatePageRequest) =>
    request<CreatePageResponse>('/pages', { method: 'POST', body: JSON.stringify(data) }),
  deletePage: (name: string) => request<{ ok: boolean }>(`/pages/${name}`, { method: 'DELETE' }),
  updatePage: (name: string, data: Partial<PageDetail>) =>
    request<{ ok: boolean }>(`/pages/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  /** List fragments. See getPages for the `target` option. */
  getFragments: (opts?: { target?: string }) =>
    request<FragmentSummary[]>(opts?.target ? `/fragments?target=${encodeURIComponent(opts.target)}` : '/fragments'),
  getFragment: (name: string, options?: RequestInit) => request<FragmentDetail>(`/fragments/${name}`, options),
  createFragment: (data: CreateFragmentRequest) =>
    request<CreateFragmentResponse>('/fragments', { method: 'POST', body: JSON.stringify(data) }),
  deleteFragment: (name: string) => request<{ ok: boolean }>(`/fragments/${name}`, { method: 'DELETE' }),
  updateFragment: (name: string, data: Partial<FragmentDetail>) =>
    request<{ ok: boolean }>(`/fragments/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  getTemplates: () => request<TemplateSummary[]>('/templates'),
  getTemplateSchema: (name: string) => request<Record<string, unknown>>(`/templates/${name}/schema`),
  getFields: () => request<FieldSummary[]>('/fields'),
  getTargets: () => request<TargetInfo[]>('/targets'),
  publish: (items: string[], targets: string[]) =>
    request<{ results: PublishResult[] }>('/publish', { method: 'POST', body: JSON.stringify({ items, targets }) }),
  publishStream,
  compare: (target: string, options?: RequestInit & { source?: string }) => {
    // `source` explicit wins. Otherwise fall back to the active-target
    // provider (server resolves its own default if neither is set).
    const src = options?.source ?? activeTargetProvider?.()
    const qs = src
      ? `?target=${encodeURIComponent(target)}&source=${encodeURIComponent(src)}`
      : `?target=${encodeURIComponent(target)}`
    return request<CompareResult>(`/compare${qs}`, options)
  },
  getDependents: (item: string, options?: RequestInit) =>
    request<{ pages: string[]; fragments: string[] }>(`/dependents?item=${encodeURIComponent(item)}`, options),
  fetchFromTarget: (source: string, items?: string[]) =>
    request<{ success: boolean; copiedFiles: number; items: string[] }>('/fetch', {
      method: 'POST',
      body: JSON.stringify({ source, items }),
    }),
  /** List revisions on a target, newest first. */
  listHistory: (target: string, limit = 50) =>
    request<{ revisions: RevisionSummary[] }>(`/history?target=${encodeURIComponent(target)}&limit=${limit}`),
  /** Undo the most recent write on a target — restores the previous
   *  revision as a forward 'rollback'. 409 when there's nothing to undo. */
  undoLastWrite: (target: string) =>
    request<{ revision: RevisionSummary; restoredFrom: string }>(`/history/undo?target=${encodeURIComponent(target)}`, {
      method: 'POST',
    }),
  /** Restore an arbitrary revision on a target. 404 when the id doesn't exist. */
  restoreRevision: (target: string, revisionId: string) =>
    request<{ revision: RevisionSummary; restoredFrom: string }>(
      `/history/restore?target=${encodeURIComponent(target)}&id=${encodeURIComponent(revisionId)}`,
      { method: 'POST' },
    ),
}

/** Summary shape returned by history endpoints (no snapshot). */
export interface RevisionSummary {
  id: string
  timestamp: string
  operation: 'save' | 'publish' | 'rollback'
  author?: string
  source?: string
  items: string[]
  message?: string
  restoredFrom?: string
}
