/**
 * Workspace Sandpack Panel
 *
 * Session-level persistent Sandpack workspace.
 * Shows file browser + Sandpack editor with live preview.
 */

import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import { Sandpack } from '@codesandbox/sandpack-react'
import { Button } from '~/components/ui/button'
import { WorkspaceFileBrowser } from './workspace-file-browser'

export interface WorkspaceSandpackPanelProps {
  sessionId: string
  onClose: () => void
}

/**
 * Detect the appropriate Sandpack template based on files
 */
function detectTemplate(files: Record<string, string>): 'react' | 'react-ts' | 'vanilla' {
  const fileNames = Object.keys(files)

  // Check for TypeScript
  if (fileNames.some((f) => f.endsWith('.tsx') || f.endsWith('.ts'))) {
    return 'react-ts'
  }

  // Check for React/JSX
  if (fileNames.some((f) => f.endsWith('.jsx') || f.endsWith('.js'))) {
    return 'react'
  }

  return 'vanilla'
}

/**
 * Determine entry file based on template
 */
function getEntryFile(template: 'react' | 'react-ts' | 'vanilla'): string {
  switch (template) {
    case 'react-ts':
      return '/App.tsx'
    case 'react':
      return '/App.js'
    case 'vanilla':
      return '/index.html'
  }
}

export const WorkspaceSandpackPanel: FC<WorkspaceSandpackPanelProps> = ({
  sessionId,
  onClose,
}) => {
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  useEffect(() => {
    const loadWorkspaceFiles = async () => {
      setIsLoading(true)

      try {
        // Get file list
        const listResponse = await fetch(`/api/workspace/${sessionId}/files`)
        if (!listResponse.ok) {
          console.error('Failed to load workspace files')
          setIsLoading(false)
          return
        }

        const { files } = await listResponse.json()

        // Load content for each file
        const fileContents: Record<string, string> = {}
        await Promise.all(
          files.map(async (filePath: string) => {
            try {
              const contentResponse = await fetch(
                `/api/workspace/${sessionId}/file/${filePath}`
              )
              if (contentResponse.ok) {
                const { content } = await contentResponse.json()
                // Ensure file path starts with /
                const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
                fileContents[normalizedPath] = content
              }
            } catch (error) {
              console.error(`Failed to load file ${filePath}:`, error)
            }
          })
        )

        setWorkspaceFiles(fileContents)
      } catch (error) {
        console.error('Failed to load workspace:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkspaceFiles()
  }, [sessionId])

  const handleFileSelect = (filePath: string, content: string) => {
    setSelectedFile(filePath)
    // Update workspace files if needed
    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
    setWorkspaceFiles((prev) => ({
      ...prev,
      [normalizedPath]: content,
    }))
  }

  const handleDownloadWorkspace = () => {
    // Create a JSON file with all workspace files
    const workspaceData = JSON.stringify(workspaceFiles, null, 2)
    const blob = new Blob([workspaceData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workspace-${sessionId.slice(0, 8)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const template = detectTemplate(workspaceFiles)
  const entryFile = getEntryFile(template)
  const fileCount = Object.keys(workspaceFiles).length

  return (
    <div className="workspace-sandpack-panel h-full w-full flex flex-col border-l bg-background">
      {/* Header */}
      <div className="workspace-header flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Workspace</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground">{fileCount} files</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownloadWorkspace}
            title="Download workspace"
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

      {/* Content: File Browser + Sandpack */}
      <div className="workspace-content flex-1 flex overflow-hidden">
        {/* File Browser Sidebar */}
        <div className="workspace-sidebar w-64 border-r overflow-auto">
          <div className="p-2">
            <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
              FILES
            </div>
            <WorkspaceFileBrowser sessionId={sessionId} onFileSelect={handleFileSelect} />
          </div>
        </div>

        {/* Sandpack Editor + Preview */}
        <div className="workspace-editor flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Loading workspace...
            </div>
          ) : fileCount === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No files in workspace yet. Start chatting to create files!
            </div>
          ) : (
            <Sandpack
              template={template}
              files={Object.fromEntries(
                Object.entries(workspaceFiles).map(([path, code]) => [
                  path,
                  { code, active: path === selectedFile || path === entryFile },
                ])
              )}
              options={{
                showNavigator: false,
                showTabs: true,
                showLineNumbers: true,
                editorHeight: '100%',
                editorWidthPercentage: 50,
              }}
              theme="auto"
            />
          )}
        </div>
      </div>
    </div>
  )
}
