/**
 * React Artifact Renderer
 *
 * Renders React/JavaScript components using Sandpack.
 */

import type { FC } from 'react'
import { Sandpack } from '@codesandbox/sandpack-react'

export interface ReactArtifactProps {
  content: string
  title?: string
  fileName?: string
}

export const ReactArtifact: FC<ReactArtifactProps> = ({ content, fileName = 'App.jsx' }) => {
  // Determine if this is TypeScript based on file extension
  const isTypeScript = fileName?.endsWith('.tsx') || fileName?.endsWith('.ts')

  // Sandpack React template uses /App.js (not .jsx) as the default entry file
  // Use .js for JavaScript and .tsx for TypeScript
  const entryFile = isTypeScript ? '/App.tsx' : '/App.js'

  return (
    <div className="artifact-react-content h-full w-full">
      <Sandpack
        template={isTypeScript ? 'react-ts' : 'react'}
        files={{
          [entryFile]: {
            code: content,
            active: true,
          },
        }}
        options={{
          showNavigator: false,
          showTabs: true,
          showLineNumbers: true,
          editorHeight: '100%',
          editorWidthPercentage: 50,
        }}
        theme="auto"
      />
    </div>
  )
}
