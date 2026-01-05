/**
 * Skills Detail Module
 *
 * Provides functions to retrieve full Skill details including all files
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SkillInfo } from './types'
import type { SkillFile, SkillDetail } from './detail-types'

// Re-export types for frontend use
export type { SkillFile, SkillDetail } from './detail-types'

/** Maximum file size to load (1MB) */
const MAX_FILE_SIZE = 1024 * 1024

/** Binary file extensions to skip loading content */
const BINARY_EXTENSIONS = new Set([
  '.tar.gz',
  '.tar',
  '.gz',
  '.zip',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
])

export interface SkillFile {
  path: string // Relative path from skill root, e.g., "SKILL.md" or "scripts/init.py"
  name: string // File or directory name
  type: 'file' | 'dir'
  content?: string // File content for text files
  size?: number // File size in bytes
  isBinary?: boolean // True for binary files
  isTooLarge?: boolean // True if file exceeds MAX_FILE_SIZE
  children?: SkillFile[] // Child files/directories (for directories)
}

export interface SkillDetail extends SkillInfo {
  files: SkillFile[] // Complete file tree
}

/**
 * Check if a file is binary based on extension
 */
function isBinaryFile(filePath: string): boolean {
  const ext = filePath.toLowerCase()
  for (const binaryExt of BINARY_EXTENSIONS) {
    if (ext.endsWith(binaryExt)) {
      return true
    }
  }
  return false
}

/**
 * Recursively build file tree for a skill directory
 */
async function buildFileTree(
  dirPath: string,
  relativePath: string = ''
): Promise<SkillFile[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })

  const files: SkillFile[] = []

  // Sort: directories first, then files, both alphabetically
  const sortedEntries = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of sortedEntries) {
    // Skip hidden files and .DS_Store
    if (entry.name.startsWith('.') || entry.name === '.DS_Store') {
      continue
    }

    const fullPath = path.join(dirPath, entry.name)
    const fileRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      // Recursively process directory
      const children = await buildFileTree(fullPath, fileRelativePath)
      files.push({
        path: fileRelativePath,
        name: entry.name,
        type: 'dir',
        children,
      })
    } else {
      // Process file
      const stats = await fs.stat(fullPath)
      const isBinary = isBinaryFile(entry.name)
      const isTooLarge = stats.size > MAX_FILE_SIZE

      let content: string | undefined
      if (!isBinary && !isTooLarge) {
        try {
          content = await fs.readFile(fullPath, 'utf-8')
        } catch (error) {
          // Skip files that can't be read as text
          console.warn(`[Skills] Failed to read file: ${fileRelativePath}`, error)
        }
      }

      files.push({
        path: fileRelativePath,
        name: entry.name,
        type: 'file',
        content,
        size: stats.size,
        isBinary,
        isTooLarge,
      })
    }
  }

  return files
}

/**
 * Get full Skill detail including all files
 */
export async function getSkillDetail(skillSlug: string): Promise<SkillDetail> {
  const skillDir = path.join(process.cwd(), 'src', 'skills-store', skillSlug)

  // Get basic skill info from metadata
  const { parseSkillMetadata } = await import('./metadata')
  const baseInfo = await parseSkillMetadata(skillDir, skillSlug)

  if (!baseInfo) {
    throw new Error(`Skill not found: ${skillSlug}`)
  }

  // Build complete file tree
  const files = await buildFileTree(skillDir)

  return {
    slug: skillSlug,
    name: baseInfo.name,
    description: baseInfo.description,
    category: baseInfo.category,
    files,
  }
}
