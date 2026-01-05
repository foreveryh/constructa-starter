/**
 * Artifacts Panel
 *
 * Main panel component for displaying and interacting with artifacts.
 */

import { Download, X } from 'lucide-react'
import type { FC } from 'react'
import { Button } from '~/components/ui/button'
import { useArtifactsStore } from '~/lib/stores/artifacts-store'
import { HTMLArtifact } from './artifact-html'
import { SVGArtifact } from './artifact-svg'
import { MarkdownArtifact } from './artifact-markdown'
import { ReactArtifact } from './artifact-react'

export interface ArtifactsPanelProps {
  artifactId: string | null
  onClose: () => void
}

export const ArtifactsPanel: FC<ArtifactsPanelProps> = ({ artifactId, onClose }) => {
  const artifact = useArtifactsStore((state) => {
    if (!artifactId) return null
    return state.getArtifactById(artifactId)
  })

  const downloadArtifact = () => {
    if (!artifact) return

    // Determine MIME type and file extension based on artifact type
    const mimeTypeMap = {
      html: 'text/html;charset=utf-8',
      svg: 'image/svg+xml;charset=utf-8',
      markdown: 'text/markdown;charset=utf-8',
      react: 'text/javascript;charset=utf-8',
    } as const

    const extensionMap = {
      html: 'html',
      svg: 'svg',
      markdown: 'md',
      react: artifact.fileName?.split('.').pop() || 'jsx',
    } as const

    const blob = new Blob([artifact.content], {
      type: mimeTypeMap[artifact.type],
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = artifact.title
      ? `${artifact.title}.${extensionMap[artifact.type]}`
      : `artifact-${artifact.id.slice(0, 8)}.${extensionMap[artifact.type]}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!artifact) return null

  return (
    <div className="artifacts-panel h-full w-full flex flex-col border-l bg-background">
      {/* Header */}
      <div className="artifacts-header flex flex-col border-b bg-muted/30">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-medium text-muted-foreground">Artifact</span>
            {artifact.title && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-sm font-medium truncate">{artifact.title}</span>
              </>
            )}
            {artifact.isTemporary && (
              <span className="text-xs text-muted-foreground italic">(preview)</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={downloadArtifact}
              title="Download artifact"
              className="h-8 w-8"
            >
              <Download className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Close"
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Description (if available) */}
        {artifact.description && (
          <div className="px-4 pb-3">
            <p className="text-sm text-muted-foreground">{artifact.description}</p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="artifacts-content flex-1 overflow-hidden">
        {artifact.type === 'html' && (
          <HTMLArtifact content={artifact.content} title={artifact.title} />
        )}
        {artifact.type === 'svg' && (
          <SVGArtifact content={artifact.content} title={artifact.title} />
        )}
        {artifact.type === 'markdown' && (
          <MarkdownArtifact content={artifact.content} title={artifact.title} />
        )}
        {artifact.type === 'react' && (
          <ReactArtifact
            content={artifact.content}
            title={artifact.title}
            fileName={artifact.fileName}
          />
        )}
      </div>
    </div>
  )
}
