import { describe, it, expect, beforeEach } from 'vitest'
import type { ResolvedComponent, RenderOutput } from '../src/types.js'
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
  it('renders a leaf component with scoping', async () => {
    const result = await renderComponent(leaf('<p>hello</p>', 'p { color: red; }'))
    expect(result.html).toContain('data-gz="gz0"')
    expect(result.html).toContain('<p>hello</p>')
    expect(result.css).toContain('[data-gz="gz0"] p')
  })

  it('renders a leaf with js (js is not scoped)', async () => {
    const result = await renderComponent(leaf('<div></div>', '', 'console.log("hi")'))
    expect(result.js).toBe('console.log("hi")')
  })

  it('passes content to template', async () => {
    const component: ResolvedComponent = {
      template: ({ content }) => ({
        html: `<h1>${content?.title}</h1>`,
        css: '',
        js: '',
      }),
      content: { title: 'Hello World' },
      children: [],
    }
    const result = await renderComponent(component)
    expect(result.html).toContain('<h1>Hello World</h1>')
  })

  it('renders a composite with children', async () => {
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
    const result = await renderComponent(parent)
    expect(result.html).toContain('<span>A</span>')
    expect(result.html).toContain('<span>B</span>')
    expect(result.css).toContain('[data-gz=')
  })

  it('each component gets a unique scope id', async () => {
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
    const result = await renderComponent(parent)
    expect(result.html).toContain('data-gz="gz0"')
    expect(result.html).toContain('data-gz="gz1"')
    expect(result.html).toContain('data-gz="gz2"')
  })

  it('passes route params to templates', async () => {
    const component: ResolvedComponent = {
      template: ({ params }) => ({
        html: `<h1>${params?.slug ?? 'no slug'}</h1>`,
        css: '',
        js: '',
      }),
      children: [],
    }
    const result = await renderComponent(component, { slug: 'hello-world' })
    expect(result.html).toContain('hello-world')
  })

  it('passes route params through to children', async () => {
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
    const result = await renderComponent(parent, { id: '42' })
    expect(result.html).toContain('42')
  })

  it('renders nested composites (3 levels deep)', async () => {
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
    const result = await renderComponent(root)
    expect(result.html).toContain('<em>deep</em>')
    expect(result.html).toContain('<section>')
    expect(result.html).toContain('<main>')
  })

  it('supports async templates', async () => {
    const component: ResolvedComponent = {
      template: async ({ content }) => ({
        html: `<h1>${content?.title}</h1>`,
        css: '',
        js: '',
      }),
      content: { title: 'Async Template' },
      children: [],
    }
    const result = await renderComponent(component)
    expect(result.html).toContain('<h1>Async Template</h1>')
  })

  it('collects head from template output', async () => {
    const component: ResolvedComponent = {
      template: () => ({
        html: '<div>content</div>',
        css: '',
        js: '',
        head: '<link rel="icon" href="/favicon.svg">',
      }),
      children: [],
    }
    const result = await renderComponent(component)
    expect(result.head).toContain('<link rel="icon" href="/favicon.svg">')
  })

  it('collects head from children and parent', async () => {
    const child: ResolvedComponent = {
      template: () => ({ html: '<p>child</p>', css: '', js: '', head: '<link rel="preconnect" href="https://fonts.example.com">' }),
      children: [],
    }
    const parent = composite(
      (children) => ({
        html: children.map(c => c.html).join(''),
        css: '',
        js: '',
        head: `<link rel="icon" href="/favicon.svg">\n${children.map(c => c.head).filter(Boolean).join('\n')}`,
      }),
      [child]
    )
    const result = await renderComponent(parent)
    expect(result.head).toContain('favicon.svg')
    expect(result.head).toContain('fonts.example.com')
  })
})

describe('renderPage', () => {
  it('wraps output in HTML document', async () => {
    const page = leaf('<p>content</p>', 'p {}')
    const html = await renderPage(page)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<style>')
    expect(html).toContain('<p>content</p>')
  })

  it('renders title from template head output', async () => {
    const page: ResolvedComponent = {
      template: () => ({ html: '<p></p>', css: '', js: '', head: '<title>My Page</title>' }),
      children: [],
    }
    const html = await renderPage(page)
    expect(html).toContain('<title>My Page</title>')
  })

  it('includes script tag when js is present', async () => {
    const page = leaf('<p></p>', '', 'alert(1)')
    const html = await renderPage(page)
    expect(html).toContain('<script type="module">alert(1)</script>')
  })

  it('omits script tag when js is empty', async () => {
    const page = leaf('<p></p>', '', '')
    const html = await renderPage(page)
    expect(html).not.toContain('<script')
  })

  it('includes head tags from page template', async () => {
    const page: ResolvedComponent = {
      template: () => ({
        html: '<p>content</p>',
        css: '',
        js: '',
        head: '<link rel="icon" href="/favicon.svg">\n<link rel="preconnect" href="https://fonts.example.com">',
      }),
      children: [],
    }
    const html = await renderPage(page)
    expect(html).toContain('<link rel="icon" href="/favicon.svg">')
    expect(html).toContain('fonts.example.com')
  })

  it('resets scope counter between pages', async () => {
    const page = composite(
      (children) => ({ html: children.map(c => c.html).join(''), css: children.map(c => c.css).join(''), js: '' }),
      [leaf('<p>child</p>', '.p {}')]
    )
    await renderPage(page)
    const html = await renderPage(page)
    expect(html).toContain('data-gz="gz0"')
  })
})
