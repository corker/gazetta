import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TemplateFunction } from '@gazetta/shared'

interface FeatureCardProps {
  icon: string
  title: string
  description: string
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="feature-card">
      <span className="feature-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

const template: TemplateFunction = ({ content = {} }) => ({
  html: renderToStaticMarkup(
    <FeatureCard
      icon={(content.icon as string) ?? ''}
      title={(content.title as string) ?? ''}
      description={(content.description as string) ?? ''}
    />
  ),
  css: `.feature-card { padding: 1.5rem; border: 1px solid #eee; border-radius: 8px; text-align: center; }
.feature-icon { font-size: 2rem; display: block; margin-bottom: 0.5rem; }
.feature-card h3 { font-size: 1.125rem; margin-bottom: 0.5rem; }
.feature-card p { color: #666; font-size: 0.875rem; }`,
  js: '',
})

export default template
