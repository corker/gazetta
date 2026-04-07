import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { processContent } from '../src/content.js'
import { format } from '../src/formats.js'

describe('processContent', () => {
  it('converts markdown fields to HTML', () => {
    const schema = z.object({
      body: z.string().meta(format.markdown()),
    })
    const content = { body: '# Hello\n\nThis is **bold**.' }
    const result = processContent(content, schema)
    expect(result?.body).toContain('<h1>Hello</h1>')
    expect(result?.body).toContain('<strong>bold</strong>')
  })

  it('leaves non-markdown fields unchanged', () => {
    const schema = z.object({
      title: z.string(),
      body: z.string().meta(format.markdown()),
    })
    const content = { title: '# Not markdown', body: '# Is markdown' }
    const result = processContent(content, schema)
    expect(result?.title).toBe('# Not markdown')
    expect(result?.body).toContain('<h1>Is markdown</h1>')
  })

  it('handles undefined content', () => {
    const schema = z.object({ body: z.string() })
    expect(processContent(undefined, schema)).toBeUndefined()
  })

  it('handles undefined schema', () => {
    const content = { body: '# Hello' }
    expect(processContent(content, undefined)).toEqual(content)
  })

  it('handles GFM tables', () => {
    const schema = z.object({ body: z.string().meta(format.markdown()) })
    const content = { body: '| A | B |\n|---|---|\n| 1 | 2 |' }
    const result = processContent(content, schema)
    expect(result?.body).toContain('<table>')
    expect(result?.body).toContain('<td>1</td>')
  })

  it('handles GFM strikethrough', () => {
    const schema = z.object({ body: z.string().meta(format.markdown()) })
    const content = { body: '~~deleted~~' }
    const result = processContent(content, schema)
    expect(result?.body).toContain('<del>deleted</del>')
  })

  it('handles code blocks', () => {
    const schema = z.object({ body: z.string().meta(format.markdown()) })
    const content = { body: '```ts\nconst x = 1\n```' }
    const result = processContent(content, schema)
    expect(result?.body).toContain('<code')
    expect(result?.body).toContain('const x = 1')
  })
})

describe('format helpers', () => {
  it('format.markdown() produces correct meta', () => {
    expect(format.markdown()).toEqual({ format: 'markdown' })
  })

  it('format.textarea() produces correct meta with options', () => {
    expect(format.textarea({ rows: 5 })).toEqual({ format: 'textarea', rows: 5 })
  })

  it('format.color() produces correct meta', () => {
    expect(format.color()).toEqual({ format: 'color' })
  })

  it('format meta flows through to JSON Schema', () => {
    const schema = z.object({
      body: z.string().meta(format.markdown()),
      color: z.string().meta(format.color()),
    })
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
    const props = jsonSchema.properties as Record<string, Record<string, unknown>>
    expect(props.body.format).toBe('markdown')
    expect(props.color.format).toBe('color')
  })
})
