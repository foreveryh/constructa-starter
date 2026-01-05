/**
 * Artifact Button Component
 *
 * Displays a button to view an artifact.
 * Shows in assistant messages when an artifact is detected.
 */

import { Eye } from 'lucide-react'
import type { FC } from 'react'
import { Button } from '~/components/ui/button'

export interface ArtifactButtonProps {
  onClick: () => void
  type: 'html' | 'svg' | 'markdown' | 'react'
}

export const ArtifactButton: FC<ArtifactButtonProps> = ({ onClick, type }) => {
  const labelMap = {
    html: 'HTML Artifact',
    svg: 'SVG Artifact',
    markdown: 'Markdown Document',
    react: 'React Component',
  }

  const label = labelMap[type]

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="mt-2 gap-2 text-sm"
    >
      <Eye className="h-4 w-4" />
      View {label}
    </Button>
  )
}
