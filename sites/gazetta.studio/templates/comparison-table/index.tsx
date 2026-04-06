import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({
  rows: z.array(z.object({
    label: z.string(),
    traditional: z.string(),
    gazetta: z.string(),
  })).describe('Comparison rows'),
})

interface Row {
  label: string
  traditional: string
  gazetta: string
}

function ComparisonTable({ rows }: { rows: Row[] }) {
  return (
    <table className="cmp-table">
      <thead>
        <tr>
          <th></th>
          <th className="cmp-old">Traditional CMS</th>
          <th className="cmp-new">Gazetta</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="cmp-label">{row.label}</td>
            <td className="cmp-old">{row.traditional}</td>
            <td className="cmp-new">{row.gazetta}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const template: TemplateFunction = ({ content = {} }) => {
  const rows = (content.rows ?? []) as Row[]
  return {
    html: renderToStaticMarkup(<ComparisonTable rows={rows} />),
    css: `.cmp-table { width: 100%; max-width: 48rem; margin: 0 auto; border-collapse: collapse; font-size: 0.875rem; }
.cmp-table th, .cmp-table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #1c1c1f; }
.cmp-table thead th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; font-weight: 600; }
.cmp-label { color: #a1a1aa; font-weight: 500; }
.cmp-old { color: #71717a; }
.cmp-new { color: #a78bfa; font-weight: 500; }`,
    js: '',
  }
}

export default template
