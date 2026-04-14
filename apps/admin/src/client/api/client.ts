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
  publish: (items: string[], targets: string[]) => request<{ results: Array<{ target: string; success: boolean; error?: string; copiedFiles: number }> }>('/publish', { method: 'POST', body: JSON.stringify({ items, targets }) }),
  compare: (target: string, options?: RequestInit) => request<CompareResult>(`/compare?target=${encodeURIComponent(target)}`, options),
  fetchFromTarget: (source: string, items?: string[]) => request<{ success: boolean; copiedFiles: number; items: string[] }>('/fetch', { method: 'POST', body: JSON.stringify({ source, items }) }),
}
