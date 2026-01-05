/**
 * Artifact Detection Utilities
 *
 * Detects and extracts artifacts from message content using heuristic pattern matching.
 * Based on Open-WebUI's approach for detecting HTML/CSS/JS/SVG code blocks.
 */

export interface CodeBlock {
  lang: string
  code: string
}

export interface ArtifactContent {
  html?: string
  css?: string
  js?: string
  svg?: string
  type: 'html' | 'svg' | 'unknown'
}

/**
 * Extract Markdown code blocks from content
 *
 * @param content - Message text content
 * @returns Array of code blocks with language and code
 */
export function extractCodeBlocks(content: string): CodeBlock[] {
  // Match markdown code blocks: ```lang\ncode\n```
  const regex = /```([\w-]*)\n([\s\S]*?)```/g
  const blocks: CodeBlock[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const lang = match[1]?.trim().toLowerCase() || ''
    const code = match[2]?.trim() || ''

    if (code) {
      blocks.push({ lang, code })
    }
  }

  return blocks
}

/**
 * Detect and extract artifact content from message text
 *
 * Identifies HTML, CSS, JS, and SVG code blocks and combines them
 * into renderable artifact content.
 *
 * @param content - Message text content
 * @returns Artifact content or null if no artifact detected
 */
export function detectArtifact(content: string): ArtifactContent | null {
  const blocks = extractCodeBlocks(content)

  if (blocks.length === 0) {
    return null
  }

  const artifact: ArtifactContent = {
    type: 'unknown',
  }

  // Check for SVG blocks (priority: standalone SVG)
  const svgBlock = blocks.find(
    (b) => b.lang === 'svg' || (b.lang === 'xml' && b.code.includes('<svg'))
  )

  if (svgBlock) {
    artifact.svg = svgBlock.code
    artifact.type = 'svg'
    return artifact
  }

  // Collect HTML/CSS/JS blocks
  for (const block of blocks) {
    switch (block.lang) {
      case 'html':
        artifact.html = (artifact.html || '') + block.code + '\n'
        artifact.type = 'html'
        break
      case 'css':
        artifact.css = (artifact.css || '') + block.code + '\n'
        break
      case 'js':
      case 'javascript':
        artifact.js = (artifact.js || '') + block.code + '\n'
        break
    }
  }

  // If HTML content exists, combine into complete document
  if (artifact.html) {
    artifact.html = combineHTMLDocument(artifact.html, artifact.css, artifact.js)
    artifact.type = 'html'
    return artifact
  }

  // No artifact detected
  return null
}

/**
 * Combine HTML/CSS/JS into a complete HTML document
 *
 * Handles both complete HTML documents and fragments.
 *
 * @param html - HTML content (can be fragment or complete document)
 * @param css - Optional CSS content
 * @param js - Optional JavaScript content
 * @returns Complete HTML document string
 */
function combineHTMLDocument(html: string, css?: string, js?: string): string {
  // Check if HTML already has document structure
  const hasDocumentStructure = /<(!DOCTYPE|html)/i.test(html)

  if (hasDocumentStructure) {
    // HTML already has structure, inject CSS and JS
    let result = html

    // Inject CSS before </head>
    if (css) {
      const styleTag = `  <style>\n${css.trim()}\n  </style>\n`

      if (/<\/head>/i.test(result)) {
        result = result.replace(/<\/head>/i, `${styleTag}</head>`)
      } else if (/<head[^>]*>/i.test(result)) {
        result = result.replace(/(<head[^>]*>)/i, `$1\n${styleTag}`)
      } else {
        // No head tag, insert after opening html tag
        result = result.replace(/(<html[^>]*>)/i, `$1\n<head>\n${styleTag}</head>`)
      }
    }

    // Inject JS before </body>
    if (js) {
      const scriptTag = `  <script>\n${js.trim()}\n  </script>\n`

      if (/<\/body>/i.test(result)) {
        result = result.replace(/<\/body>/i, `${scriptTag}</body>`)
      } else if (/<body[^>]*>/i.test(result)) {
        result = result.replace(/(<body[^>]*>[\s\S]*?)(<\/html>|$)/i, `$1\n${scriptTag}$2`)
      } else {
        // No body tag, append before closing html tag
        result = result.replace(/<\/html>/i, `${scriptTag}</html>`)
      }
    }

    return result
  } else {
    // HTML fragment, wrap in complete document structure
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artifact</title>
${css ? `  <style>\n${css.trim()}\n  </style>\n` : ''}</head>
<body>
${html.trim()}
${js ? `  <script>\n${js.trim()}\n  </script>\n` : ''}</body>
</html>`
  }
}

/**
 * Extract all artifacts from an array of message contents
 *
 * Used for processing message history and extracting all artifacts.
 *
 * @param messages - Array of message objects with text content
 * @returns Array of artifacts with message IDs
 */
export function extractArtifactsFromMessages(
  messages: Array<{ id: string; content: Array<{ type: string; text?: string }> }>
): Array<{ messageId: string; artifact: ArtifactContent }> {
  const artifacts: Array<{ messageId: string; artifact: ArtifactContent }> = []

  for (const message of messages) {
    for (const contentBlock of message.content) {
      if (contentBlock.type === 'text' && contentBlock.text) {
        const artifact = detectArtifact(contentBlock.text)
        if (artifact && artifact.type !== 'unknown') {
          artifacts.push({
            messageId: message.id,
            artifact,
          })
        }
      }
    }
  }

  return artifacts
}
