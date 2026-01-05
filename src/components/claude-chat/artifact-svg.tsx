/**
 * SVG Artifact Renderer
 *
 * Renders SVG artifacts directly in the DOM.
 */

import type { FC } from 'react'

export interface SVGArtifactProps {
  content: string
  title?: string
}

export const SVGArtifact: FC<SVGArtifactProps> = ({ content, title }) => {
  return (
    <div className="artifact-svg-container h-full w-full flex flex-col">
      {title && (
        <div className="artifact-title px-4 py-2 border-b bg-muted/50 text-sm font-medium">
          {title}
        </div>
      )}
      <div
        className="artifact-svg-content flex-1 w-full flex items-center justify-center bg-white p-4 overflow-auto"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  )
}
