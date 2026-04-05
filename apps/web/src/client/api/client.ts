const BASE = '/api'

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

export interface PageSummary { name: string; route: string; template: string; metadata?: Record<string, unknown> }
export interface FragmentSummary { name: string; template: string }
export interface TemplateSummary { name: string }
export interface SiteManifest { name: string; version?: string }

export interface PageDetail extends PageSummary {
  content?: Record<string, unknown>
  components?: string[]
  dir: string
}

export interface FragmentDetail extends FragmentSummary {
  content?: Record<string, unknown>
  components?: string[]
  dir: string
}

export const api = {
  getSite: () => request<SiteManifest>('/site'),
  getPages: () => request<PageSummary[]>('/pages'),
  getPage: (name: string) => request<PageDetail>(`/pages/${name}`),
  createPage: (data: { name: string; route: string; template: string; metadata?: Record<string, unknown> }) => request<{ ok: boolean; name: string }>('/pages', { method: 'POST', body: JSON.stringify(data) }),
  updatePage: (name: string, data: Partial<PageDetail>) => request<{ ok: boolean }>(`/pages/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  getFragments: () => request<FragmentSummary[]>('/fragments'),
  getFragment: (name: string) => request<FragmentDetail>(`/fragments/${name}`),
  updateFragment: (name: string, data: Partial<FragmentDetail>) => request<{ ok: boolean }>(`/fragments/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  getComponent: (path: string) => request<Record<string, unknown>>(`/components?path=${encodeURIComponent(path)}`),
  updateComponent: (path: string, data: { content: Record<string, unknown> }) => request<{ ok: boolean }>(`/components?path=${encodeURIComponent(path)}`, { method: 'PUT', body: JSON.stringify(data) }),
  createComponent: (parentDir: string, name: string, template: string) => request<{ ok: boolean; path: string }>('/components', { method: 'POST', body: JSON.stringify({ parentDir, name, template }) }),
  getTemplates: () => request<TemplateSummary[]>('/templates'),
  getTemplateSchema: (name: string) => request<Record<string, unknown>>(`/templates/${name}/schema`),
  getTargets: () => request<string[]>('/targets'),
  publish: (items: string[], targets: string[]) => request<{ results: Array<{ target: string; success: boolean; error?: string; copiedFiles: number }> }>('/publish', { method: 'POST', body: JSON.stringify({ items, targets }) }),
  fetchFromTarget: (source: string, items?: string[]) => request<{ success: boolean; copiedFiles: number; items: string[] }>('/fetch', { method: 'POST', body: JSON.stringify({ source, items }) }),
}
