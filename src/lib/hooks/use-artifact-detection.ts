/**
 * Artifact Detection Hook
 *
 * Detects artifacts in message content and creates them in the store.
 * Supports hybrid detection mode:
 * 1. Phase 1 (Heuristic): Text code blocks + Tool-call content (immediate preview, marked as temporary)
 * 2. Phase 2 (Structured Outputs): Metadata from AI (overwrites temporary with complete info)
 */

import { useEffect } from 'react'
import { detectArtifact } from '~/lib/utils/artifact-detector'
import { useArtifactsStore } from '~/lib/stores/artifacts-store'
import { useChatSessionStore } from '~/lib/chat-session-store'
import { validateArtifactMetadata, type ArtifactMetadata } from '~/lib/schemas/artifact-schema'

// Import the proper type from chat-session-store
import type { ContentPart } from '~/lib/chat-session-store'

/**
 * Detect artifact from tool-call content
 * Looks for Write tool calls with .html, .svg, .md, .jsx, or .tsx files
 */
function detectArtifactFromToolCall(content: ContentPart[]): {
  type: 'html' | 'svg' | 'markdown' | 'react'
  content: string
  fileName?: string
} | null {
  for (const part of content) {
    // Check if this is a tool-call part with the Write tool
    if (part.type === 'tool-call' && part.toolName === 'Write' && part.args) {
      const filePath = part.args.file_path as string | undefined
      const fileContent = part.args.content as string | undefined

      if (!filePath || !fileContent) continue

      // Extract file name from path
      const fileName = filePath.split('/').pop() || ''

      // Check file extension
      if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
        return { type: 'html', content: fileContent, fileName }
      } else if (filePath.endsWith('.svg')) {
        return { type: 'svg', content: fileContent, fileName }
      } else if (filePath.endsWith('.md') || filePath.endsWith('.markdown')) {
        return { type: 'markdown', content: fileContent, fileName }
      } else if (
        filePath.endsWith('.jsx') ||
        filePath.endsWith('.tsx') ||
        filePath.endsWith('.js') ||
        filePath.endsWith('.ts')
      ) {
        return { type: 'react', content: fileContent, fileName }
      }
    }
  }

  return null
}

/**
 * Hook to detect and create artifacts from message content
 * Implements hybrid detection mode:
 * - Phase 1: Heuristic detection (immediate preview, temporary)
 * - Phase 2: Structured Outputs (complete metadata, overrides temporary)
 *
 * @param messageId - Message ID
 * @param content - Message content array (text, tool-call, etc.)
 * @returns Artifact if detected, null otherwise
 */
export function useArtifactDetection(messageId: string, content: ContentPart[] | undefined) {
  const createArtifact = useArtifactsStore((state) => state.createArtifact)
  const updateArtifact = useArtifactsStore((state) => state.updateArtifact)
  const setActiveArtifact = useArtifactsStore((state) => state.setActiveArtifact)
  const artifact = useArtifactsStore((state) => state.getArtifactByMessageId(messageId))
  const lastStructuredOutput = useChatSessionStore((state) => state.lastStructuredOutput)

  // Phase 1: Heuristic Detection (Real-time Preview)
  useEffect(() => {
    // Skip if artifact already exists (non-temporary) or no content
    if ((artifact && !artifact.isTemporary) || !content || content.length === 0) return

    // ✅ FIX: Only detect artifacts from completed tool calls (with result)
    // This prevents rendering loops caused by detecting incomplete tool-use events
    const hasCompletedToolCall = content.some(p =>
      p.type === 'tool-call' &&
      p.toolName === 'Write' &&
      p.result !== undefined  // Must have a result (tool completed)
    )

    if (!hasCompletedToolCall) {
      console.log('[Artifact Detection] Waiting for tool completion...')
      return  // Exit early - don't detect until tool is done
    }

    // Method 1: Check tool-call content (priority - more reliable)
    const toolArtifact = detectArtifactFromToolCall(content)
    if (toolArtifact) {
      if (artifact) {
        // ✅ FIX: Don't update if artifact already exists
        // Updating triggers Store changes → re-render → infinite loop
        // Phase 2 (Structured Outputs) will handle updates
        console.log('[Artifact Detection] Artifact already exists, skipping update to avoid render loop')
        return
      } else {
        // Create new temporary artifact
        const artifactId = createArtifact({
          messageId,
          type: toolArtifact.type,
          content: toolArtifact.content,
          fileName: toolArtifact.fileName,
          isTemporary: true, // Mark as temporary
        })
        // Auto-open the artifact panel
        setActiveArtifact(artifactId)
        console.log('[Artifact Detection] Created artifact after tool completion')
      }
      return
    }

    // Method 2: Check text content for code blocks (fallback)
    const textContent = content.find((p) => p.type === 'text')?.text
    if (!textContent) return

    const detected = detectArtifact(textContent)

    // Create artifact if detected
    if (detected && detected.type !== 'unknown') {
      const artifactContent = detected.type === 'html' ? detected.html! : detected.svg!

      if (artifact) {
        // ✅ FIX: Don't update if artifact already exists
        // Updating triggers Store changes → re-render → infinite loop
        console.log('[Artifact Detection] Artifact already exists (from text), skipping update')
        return
      } else {
        // Create new temporary artifact
        const artifactId = createArtifact({
          messageId,
          type: detected.type,
          content: artifactContent,
          isTemporary: true, // Mark as temporary
        })
        // Auto-open the artifact panel
        setActiveArtifact(artifactId)
      }
    }
  }, [messageId, content, artifact, createArtifact, updateArtifact, setActiveArtifact])

  // Phase 2: Structured Outputs (Complete Metadata)
  useEffect(() => {
    // Skip if no structured output
    if (!lastStructuredOutput) return

    // Validate structured output against schema
    const metadata = validateArtifactMetadata(lastStructuredOutput)
    if (!metadata) {
      console.warn('[Artifact Detection] Invalid structured output:', lastStructuredOutput)
      return
    }

    console.log('[Artifact Detection] Received structured output:', metadata)

    // Get primary file content (first file or combined HTML)
    const primaryContent = getPrimaryContent(metadata)
    if (!primaryContent) {
      console.warn('[Artifact Detection] No primary content in structured output')
      return
    }

    // Check if we have a temporary artifact for this message
    if (artifact?.isTemporary) {
      // Update temporary artifact with complete metadata
      updateArtifact(artifact.id, {
        title: metadata.title,
        description: metadata.description,
        type: metadata.type,
        content: primaryContent,
        isTemporary: false, // No longer temporary
      })
      console.log('[Artifact Detection] Updated temporary artifact with metadata')
    } else if (!artifact) {
      // Create new artifact from structured output
      const artifactId = createArtifact({
        messageId,
        title: metadata.title,
        description: metadata.description,
        type: metadata.type,
        content: primaryContent,
        fileName: metadata.files[0]?.path,
        isTemporary: false,
      })
      // Auto-open the artifact panel
      setActiveArtifact(artifactId)
      console.log('[Artifact Detection] Created artifact from structured output')
    }
    // If artifact exists and is not temporary, don't overwrite
  }, [lastStructuredOutput, messageId, artifact, createArtifact, updateArtifact, setActiveArtifact])

  return artifact
}

/**
 * Extract primary content from structured output
 * For single file: return first file content
 * For multi-file HTML: combine into single HTML document
 */
function getPrimaryContent(metadata: ArtifactMetadata): string | null {
  if (metadata.files.length === 0) return null

  // For single file, return content directly
  if (metadata.files.length === 1) {
    return metadata.files[0].content
  }

  // For HTML with multiple files, combine them
  if (metadata.type === 'html') {
    const htmlFile = metadata.files.find((f) => f.language === 'html')
    const cssFiles = metadata.files.filter((f) => f.language === 'css')
    const jsFiles = metadata.files.filter((f) => f.language === 'javascript')

    if (!htmlFile) return metadata.files[0].content

    let combined = htmlFile.content

    // Inject CSS
    if (cssFiles.length > 0) {
      const cssContent = cssFiles.map((f) => f.content).join('\n')
      const styleTag = `<style>\n${cssContent}\n</style>`

      // Try to inject before </head>, fallback to before </body>
      if (combined.includes('</head>')) {
        combined = combined.replace('</head>', `${styleTag}\n</head>`)
      } else if (combined.includes('</body>')) {
        combined = combined.replace('</body>', `${styleTag}\n</body>`)
      } else {
        combined = styleTag + '\n' + combined
      }
    }

    // Inject JS
    if (jsFiles.length > 0) {
      const jsContent = jsFiles.map((f) => f.content).join('\n')
      const scriptTag = `<script>\n${jsContent}\n</script>`

      // Inject before </body>, fallback to end
      if (combined.includes('</body>')) {
        combined = combined.replace('</body>', `${scriptTag}\n</body>`)
      } else {
        combined = combined + '\n' + scriptTag
      }
    }

    return combined
  }

  // For React/other types, return first file
  return metadata.files[0].content
}
