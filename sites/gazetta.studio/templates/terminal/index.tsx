import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  lines: z.array(z.object({
    command: z.string().optional().describe('Command to type'),
    output: z.string().optional().describe('Output (appears instantly)'),
    delay: z.number().optional().describe('Delay before this line in ms'),
  })).describe('Terminal lines'),
  title: z.string().optional().describe('Window title'),
})

type Content = z.infer<typeof schema>

function TerminalBar({ title }: { title: string }) {
  return (
    <div className="term-bar">
      <span className="term-dot term-dot-red" />
      <span className="term-dot term-dot-yellow" />
      <span className="term-dot term-dot-green" />
      <span className="term-title">{title}</span>
    </div>
  )
}

function TerminalLine({ line, idx }: { line: Content['lines'][number]; idx: number }) {
  if (line.command) {
    return (
      <div className="term-line" data-idx={idx} data-type="command" style={{ opacity: 0 }}>
        <span className="term-prompt">$</span>{' '}
        <span className="term-cmd" />
        <span className="term-cursor">▋</span>
      </div>
    )
  }
  return (
    <div className="term-line" data-idx={idx} data-type="output" style={{ opacity: 0 }}>
      <span className="term-output" />
    </div>
  )
}

function Terminal({ id, title, lines }: { id: string; title: string; lines: Content['lines'] }) {
  return (
    <div className="terminal" id={id}>
      <TerminalBar title={title} />
      <div className="term-body">
        {lines.map((line, i) => <TerminalLine key={i} line={line} idx={i} />)}
      </div>
    </div>
  )
}

const template: TemplateFunction<Content> = ({ content }) => {
  const { lines = [], title = 'Terminal' } = content ?? {}
  const id = `term-${Math.random().toString(36).slice(2, 8)}`

  return {
    html: renderToStaticMarkup(<Terminal id={id} title={title} lines={lines} />),
    css: `.terminal { max-width: 40rem; margin: 0 auto; border-radius: 8px; overflow: hidden; border: 1px solid #27272a; background: #0a0a0a; }
.term-bar { display: flex; align-items: center; gap: 6px; padding: 0.75rem 1rem; background: #18181b; border-bottom: 1px solid #27272a; }
.term-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.term-dot-red { background: #ef4444; }
.term-dot-yellow { background: #eab308; }
.term-dot-green { background: #22c55e; }
.term-title { margin-left: 0.5rem; font-size: 0.75rem; color: #52525b; }
.term-body { padding: 1rem 1.25rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.875rem; line-height: 1.8; min-height: 12rem; }
.term-line { white-space: pre; }
.term-prompt { color: #22c55e; }
.term-cmd { color: #e4e4e7; }
.term-output { color: #71717a; }
.term-cursor { color: #22c55e; animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }`,
    js: `{
  const el = document.getElementById('${id}')
  const lines = ${JSON.stringify(lines)}

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  async function typeLine(lineEl, text) {
    const cmdEl = lineEl.querySelector('.term-cmd')
    const cursorEl = lineEl.querySelector('.term-cursor')
    lineEl.style.opacity = '1'
    for (let i = 0; i <= text.length; i++) {
      cmdEl.textContent = text.slice(0, i)
      await sleep(30 + Math.random() * 40)
    }
    if (cursorEl) cursorEl.style.display = 'none'
  }

  async function showOutput(lineEl, text) {
    lineEl.style.opacity = '1'
    lineEl.querySelector('.term-output').textContent = text
  }

  async function run() {
    await sleep(800)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineEl = el.querySelector('[data-idx="' + i + '"]')
      if (!lineEl) continue
      if (line.delay) await sleep(line.delay)
      if (line.command) { await typeLine(lineEl, line.command); await sleep(200) }
      else if (line.output) { await showOutput(lineEl, line.output); await sleep(100) }
    }
  }

  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) { obs.disconnect(); run() }
  }, { threshold: 0.3 }).observe(el)
}`,
  }
}

export default template
