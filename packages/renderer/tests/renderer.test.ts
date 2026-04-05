import { describe, it, expect } from 'vitest'
import type { ResolvedComponent, RenderOutput } from '@gazetta/shared'
import { renderComponent, renderPage } from '../src/renderer.js'

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
  it('renders a leaf component', () => {
    const result = renderComponent(leaf('<p>hello</p>', 'p { color: red; }'))
    expect(result.html).toBe('<p>hello</p>')
    expect(result.css).toBe('p { color: red; }')
    expect(result.js).toBe('')
  })

  it('renders a leaf with js', () => {
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
    expect(result.html).toBe('<h1>Hello World</h1>')
  })

  it('renders a composite with children', () => {
    const parent = composite(
      (children) => ({
        html: `<div>${children.map(c => c.html).join('')}</div>`,
        css: children.map(c => c.css).join('\n'),
        js: '',
      }),
      [
        leaf('<span>A</span>', '.a {}'),
        leaf('<span>B</span>', '.b {}'),
      ]
    )
    const result = renderComponent(parent)
    expect(result.html).toBe('<div><span>A</span><span>B</span></div>')
    expect(result.css).toBe('.a {}\n.b {}')
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
    expect(result.html).toBe('<main><section><em>deep</em></section></main>')
  })

  it('collects css and js through the tree', () => {
    const root = composite(
      (children) => ({
        html: '<div></div>',
        css: `.root {} ${children.map(c => c.css).join(' ')}`,
        js: children.map(c => c.js).join(';'),
      }),
      [
        leaf('<a></a>', '.a {}', 'a()'),
        leaf('<b></b>', '.b {}', 'b()'),
      ]
    )
    const result = renderComponent(root)
    expect(result.css).toContain('.root {}')
    expect(result.css).toContain('.a {}')
    expect(result.css).toContain('.b {}')
    expect(result.js).toBe('a();b()')
  })
})

describe('renderPage', () => {
  it('wraps output in HTML document', () => {
    const page = leaf('<p>content</p>', 'p {}')
    const html = renderPage(page, { title: 'Test Page' })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Test Page</title>')
    expect(html).toContain('<style>p {}</style>')
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
})
