// API is relative to the CMS base path: /admin/api, /cms/api, or /api
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') + '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem('gazetta_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers, ...options?.headers } })
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
  signal?: AbortSignal,
): Promise<PublishResult[]> {
  const token = sessionStorage.getItem('gazetta_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}/publish/stream`, {
    method: 'POST', headers, body: JSON.stringify({ items, targets }), signal,
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

export interface PageSummary { name: string; route: string; template: string }
export interface FragmentSummary { name: string; template: string }
export interface TemplateSummary { name: string }
export interface FieldSummary { name: string; path: string }
export interface SiteManifest { name: string; version?: string; systemPages?: string[] }

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
export interface TargetInfo { name: string; environment: TargetEnvironment }

export interface PublishResult { target: string; success: boolean; error?: string; copiedFiles: number }
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
  getPages: () => request<PageSummary[]>('/pages'),
  getPage: (name: string, options?: RequestInit) => request<PageDetail>(`/pages/${name}`, options),
  createPage: (data: { name: string; template: string }) => request<{ ok: boolean; name: string }>('/pages', { method: 'POST', body: JSON.stringify(data) }),
  deletePage: (name: string) => request<{ ok: boolean }>(`/pages/${name}`, { method: 'DELETE' }),
  updatePage: (name: string, data: Partial<PageDetail>) => request<{ ok: boolean }>(`/pages/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  getFragments: () => request<FragmentSummary[]>('/fragments'),
  getFragment: (name: string, options?: RequestInit) => request<FragmentDetail>(`/fragments/${name}`, options),
  createFragment: (data: { name: string; template: string }) => request<{ ok: boolean; name: string }>('/fragments', { method: 'POST', body: JSON.stringify(data) }),
  deleteFragment: (name: string) => request<{ ok: boolean }>(`/fragments/${name}`, { method: 'DELETE' }),
  updateFragment: (name: string, data: Partial<FragmentDetail>) => request<{ ok: boolean }>(`/fragments/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  getTemplates: () => request<TemplateSummary[]>('/templates'),
  getTemplateSchema: (name: string) => request<Record<string, unknown>>(`/templates/${name}/schema`),
  getFields: () => request<FieldSummary[]>('/fields'),
  getTargets: () => request<TargetInfo[]>('/targets'),
  publish: (items: string[], targets: string[]) => request<{ results: PublishResult[] }>('/publish', { method: 'POST', body: JSON.stringify({ items, targets }) }),
  publishStream,
  compare: (target: string, options?: RequestInit) => request<CompareResult>(`/compare?target=${encodeURIComponent(target)}`, options),
  fetchFromTarget: (source: string, items?: string[]) => request<{ success: boolean; copiedFiles: number; items: string[] }>('/fetch', { method: 'POST', body: JSON.stringify({ source, items }) }),
}
