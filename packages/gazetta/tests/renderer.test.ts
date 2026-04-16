import { describe, it, expect } from 'vitest'
import type { ResolvedComponent, RenderOutput } from '../src/types.js'
import { renderComponent, renderFragment, renderPage } from '../src/renderer.js'
import { hashPath } from '../src/scope.js'

function leaf(html: string, css = '', js = '', treePath = ''): ResolvedComponent {
  return {
    template: () => ({ html, css, js }),
    children: [],
    treePath,
  }
}

function composite(
  render: (children: RenderOutput[]) => RenderOutput,
  children: ResolvedComponent[],
  treePath = '',
): ResolvedComponent {
  return {
    template: ({ children: c }) => render(c ?? []),
    children,
    treePath,
  }
}

describe('renderComponent', () => {
  it('renders a leaf component with scoping', async () => {
    const result = await renderComponent(leaf('<p>hello</p>', 'p { color: red; }', '', 'hero'))
    const id = hashPath('hero')
    expect(result.html).toContain(`data-gz="${id}"`)
    expect(result.html).toContain('<p>hello</p>')
    expect(result.css).toContain(`[data-gz="${id}"] p`)
  })

  it('renders a leaf with js (js is not scoped)', async () => {
    const result = await renderComponent(leaf('<div></div>', '', 'console.log("hi")', 'demo'))
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
      treePath: 'hero',
    }
    const result = await renderComponent(component)
    expect(result.html).toContain('<h1>Hello World</h1>')
  })

  it('renders a composite with children', async () => {
    const parent = composite(
      children => ({
        html: `<div>${children.map(c => c.html).join('')}</div>`,
        css: `.parent {} ${children.map(c => c.css).join(' ')}`,
        js: '',
      }),
      [leaf('<span>A</span>', '.a {}', '', 'features/a'), leaf('<span>B</span>', '.b {}', '', 'features/b')],
      'features',
    )
    const result = await renderComponent(parent)
    expect(result.html).toContain('<span>A</span>')
    expect(result.html).toContain('<span>B</span>')
    expect(result.css).toContain('[data-gz=')
  })

  it('each component gets a unique scope id based on tree path', async () => {
    const parent = composite(
      children => ({
        html: children.map(c => c.html).join(''),
        css: children.map(c => c.css).join('\n'),
        js: '',
      }),
      [leaf('<span>A</span>', '.a {}', '', 'section/a'), leaf('<span>B</span>', '.b {}', '', 'section/b')],
      'section',
    )
    const result = await renderComponent(parent)
    const idA = hashPath('section/a')
    const idB = hashPath('section/b')
    const idParent = hashPath('section')
    expect(result.html).toContain(`data-gz="${idA}"`)
    expect(result.html).toContain(`data-gz="${idB}"`)
    expect(result.html).toContain(`data-gz="${idParent}"`)
    // All different
    expect(new Set([idA, idB, idParent]).size).toBe(3)
  })

  it('passes route params to templates', async () => {
    const component: ResolvedComponent = {
      template: ({ params }) => ({
        html: `<h1>${params?.slug ?? 'no slug'}</h1>`,
        css: '',
        js: '',
      }),
      children: [],
      treePath: 'article',
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
      treePath: 'parent/child',
    }
    const parent = composite(
      children => ({ html: children.map(c => c.html).join(''), css: '', js: '' }),
      [child],
      'parent',
    )
    const result = await renderComponent(parent, { id: '42' })
    expect(result.html).toContain('42')
  })

  it('renders nested composites (3 levels deep)', async () => {
    const grandchild = leaf('<em>deep</em>', '', '', 'root/mid/deep')
    const child = composite(
      children => ({
        html: `<section>${children.map(c => c.html).join('')}</section>`,
        css: '',
        js: '',
      }),
      [grandchild],
      'root/mid',
    )
    const root = composite(
      children => ({
        html: `<main>${children.map(c => c.html).join('')}</main>`,
        css: '',
        js: '',
      }),
      [child],
      'root',
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
      treePath: 'async',
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
      treePath: 'with-head',
    }
    const result = await renderComponent(component)
    expect(result.head).toContain('<link rel="icon" href="/favicon.svg">')
  })

  it('collects head from children and parent', async () => {
    const child: ResolvedComponent = {
      template: () => ({
        html: '<p>child</p>',
        css: '',
        js: '',
        head: '<link rel="preconnect" href="https://fonts.example.com">',
      }),
      children: [],
      treePath: 'layout/child',
    }
    const parent = composite(
      children => ({
        html: children.map(c => c.html).join(''),
        css: '',
        js: '',
        head: `<link rel="icon" href="/favicon.svg">\n${children
          .map(c => c.head)
          .filter(Boolean)
          .join('\n')}`,
      }),
      [child],
      'layout',
    )
    const result = await renderComponent(parent)
    expect(result.head).toContain('favicon.svg')
    expect(result.head).toContain('fonts.example.com')
  })
})

describe('renderFragment', () => {
  it('wraps output in HTML document', async () => {
    const fragment = leaf('<nav>links</nav>', 'nav {}', '', '')
    const html = await renderFragment(fragment)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<style>')
    expect(html).toContain('<nav>links</nav>')
  })

  it('includes children', async () => {
    const fragment = composite(
      children => ({ html: `<header>${children.map(c => c.html).join('')}</header>`, css: '', js: '' }),
      [leaf('<span>Logo</span>', '', '', 'logo')],
      '',
    )
    const html = await renderFragment(fragment)
    expect(html).toContain('<span>Logo</span>')
    expect(html).toContain('<header>')
  })

  it('includes head, css, and js', async () => {
    const fragment: ResolvedComponent = {
      template: () => ({
        html: '<nav>nav</nav>',
        css: 'nav { color: red; }',
        js: 'console.log("nav")',
        head: '<link rel="icon" href="/favicon.svg">',
      }),
      children: [],
      treePath: '',
    }
    const html = await renderFragment(fragment)
    expect(html).toContain('nav { color: red; }')
    expect(html).toContain('<script type="module">console.log("nav")</script>')
    expect(html).toContain('<link rel="icon" href="/favicon.svg">')
  })
})

describe('renderPage', () => {
  it('wraps output in HTML document', async () => {
    const page = leaf('<p>content</p>', 'p {}', '', 'page')
    const html = await renderPage(page)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<style>')
    expect(html).toContain('<p>content</p>')
  })

  it('renders title from template head output', async () => {
    const page: ResolvedComponent = {
      template: () => ({ html: '<p></p>', css: '', js: '', head: '<title>My Page</title>' }),
      children: [],
      treePath: '',
    }
    const html = await renderPage(page)
    expect(html).toContain('<title>My Page</title>')
  })

  it('does not inject title when template has no head', async () => {
    const page = leaf('<p>no head</p>', '', '', 'page')
    const html = await renderPage(page)
    expect(html).not.toContain('<title>')
  })

  it('includes script tag when js is present', async () => {
    const page = leaf('<p></p>', '', 'alert(1)', 'page')
    const html = await renderPage(page)
    expect(html).toContain('<script type="module">alert(1)</script>')
  })

  it('omits script tag when js is empty', async () => {
    const page = leaf('<p></p>', '', '', 'page')
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
      treePath: '',
    }
    const html = await renderPage(page)
    expect(html).toContain('<link rel="icon" href="/favicon.svg">')
    expect(html).toContain('fonts.example.com')
  })

  it('scope IDs are deterministic across renders', async () => {
    const page = composite(
      children => ({ html: children.map(c => c.html).join(''), css: children.map(c => c.css).join(''), js: '' }),
      [leaf('<p>child</p>', '.p {}', '', 'child')],
      'page',
    )
    const html1 = await renderPage(page)
    const html2 = await renderPage(page)
    // Same tree path → same scope ID → same HTML
    const id = hashPath('child')
    expect(html1).toContain(`data-gz="${id}"`)
    expect(html2).toContain(`data-gz="${id}"`)
  })
})
