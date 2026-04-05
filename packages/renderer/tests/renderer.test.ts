import { describe, it, expect, beforeEach } from 'vitest'
import type { ResolvedComponent, RenderOutput } from '@gazetta/core'
import { renderComponent, renderPage } from '../src/renderer.js'
import { resetScopeCounter } from '../src/scope.js'

beforeEach(() => {
  resetScopeCounter()
})

function leaf(html: string, css = '', js = ''): ResolvedComponent {
  return {
    template: () => ({ html, css, js }),
    children: [],
  }
}

function composite(
  render: (children: RenderOutput[]) => RenderOutput,
  children: ResolvedComponent[]
): ResolvedComponent {
  return {
    template: ({ children: c }) => render(c ?? []),
    children,
  }
}

describe('renderComponent', () => {
  it('renders a leaf component with scoping', () => {
    const result = renderComponent(leaf('<p>hello</p>', 'p { color: red; }'))
    expect(result.html).toContain('data-gz="gz0"')
    expect(result.html).toContain('<p>hello</p>')
    expect(result.css).toContain('[data-gz="gz0"] p')
  })

  it('renders a leaf with js (js is not scoped)', () => {
    const result = renderComponent(leaf('<div></div>', '', 'console.log("hi")'))
    expect(result.js).toBe('console.log("hi")')
  })

  it('passes content to template', () => {
    const component: ResolvedComponent = {
      template: ({ content }) => ({
        html: `<h1>${content?.title}</h1>`,
        css: '',
        js: '',
      }),
      content: { title: 'Hello World' },
      children: [],
    }
    const result = renderComponent(component)
    expect(result.html).toContain('<h1>Hello World</h1>')
  })

  it('renders a composite with children', () => {
    const parent = composite(
      (children) => ({
        html: `<div>${children.map(c => c.html).join('')}</div>`,
        css: `.parent {} ${children.map(c => c.css).join(' ')}`,
        js: '',
      }),
      [
        leaf('<span>A</span>', '.a {}'),
        leaf('<span>B</span>', '.b {}'),
      ]
    )
    const result = renderComponent(parent)
    expect(result.html).toContain('<span>A</span>')
    expect(result.html).toContain('<span>B</span>')
    // Parent gets its own scope, children have theirs
    expect(result.css).toContain('[data-gz=')
  })

  it('each component gets a unique scope id', () => {
    const parent = composite(
      (children) => ({
        html: children.map(c => c.html).join(''),
        css: children.map(c => c.css).join('\n'),
        js: '',
      }),
      [
        leaf('<span>A</span>', '.a {}'),
        leaf('<span>B</span>', '.b {}'),
      ]
    )
    const result = renderComponent(parent)
    // Children get gz0 and gz1, parent gets gz2
    expect(result.html).toContain('data-gz="gz0"')
    expect(result.html).toContain('data-gz="gz1"')
    expect(result.html).toContain('data-gz="gz2"')
  })

  it('passes route params to templates', () => {
    const component: ResolvedComponent = {
      template: ({ params }) => ({
        html: `<h1>${params?.slug ?? 'no slug'}</h1>`,
        css: '',
        js: '',
      }),
      children: [],
    }
    const result = renderComponent(component, { slug: 'hello-world' })
    expect(result.html).toContain('hello-world')
  })

  it('passes route params through to children', () => {
    const child: ResolvedComponent = {
      template: ({ params }) => ({
        html: `<span>${params?.id ?? 'no id'}</span>`,
        css: '',
        js: '',
      }),
      children: [],
    }
    const parent = composite(
      (children) => ({ html: children.map(c => c.html).join(''), css: '', js: '' }),
      [child]
    )
    const result = renderComponent(parent, { id: '42' })
    expect(result.html).toContain('42')
  })

  it('renders nested composites (3 levels deep)', () => {
    const grandchild = leaf('<em>deep</em>')
    const child = composite(
      (children) => ({
        html: `<section>${children.map(c => c.html).join('')}</section>`,
        css: '',
        js: '',
      }),
      [grandchild]
    )
    const root = composite(
      (children) => ({
        html: `<main>${children.map(c => c.html).join('')}</main>`,
        css: '',
        js: '',
      }),
      [child]
    )
    const result = renderComponent(root)
    expect(result.html).toContain('<em>deep</em>')
    expect(result.html).toContain('<section>')
    expect(result.html).toContain('<main>')
  })
})

describe('renderPage', () => {
  it('wraps output in HTML document', () => {
    const page = leaf('<p>content</p>', 'p {}')
    const html = renderPage(page, { title: 'Test Page' })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Test Page</title>')
    expect(html).toContain('<style>')
    expect(html).toContain('<p>content</p>')
  })

  it('includes description meta tag when provided', () => {
    const page = leaf('<p></p>')
    const html = renderPage(page, { title: 'T', description: 'My description' })
    expect(html).toContain('<meta name="description" content="My description">')
  })

  it('omits description meta tag when not provided', () => {
    const page = leaf('<p></p>')
    const html = renderPage(page, { title: 'T' })
    expect(html).not.toContain('meta name="description"')
  })

  it('defaults title to Gazetta', () => {
    const page = leaf('<p></p>')
    const html = renderPage(page)
    expect(html).toContain('<title>Gazetta</title>')
  })

  it('includes script tag when js is present', () => {
    const page = leaf('<p></p>', '', 'alert(1)')
    const html = renderPage(page)
    expect(html).toContain('<script type="module">alert(1)</script>')
  })

  it('omits script tag when js is empty', () => {
    const page = leaf('<p></p>', '', '')
    const html = renderPage(page)
    expect(html).not.toContain('<script')
  })

  it('resets scope counter between pages', () => {
    const page = leaf('<p></p>', '.p {}')
    renderPage(page)
    const html = renderPage(page)
    // After reset, scope should start from gz0 again
    expect(html).toContain('data-gz="gz0"')
  })
})
