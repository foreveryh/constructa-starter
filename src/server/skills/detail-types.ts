/**
 * Skill Detail Types
 *
 * Shared types for Skill detail functionality
 */

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

export interface SkillDetail {
  slug: string
  name: string
  description: string | null
  category: string
  files: SkillFile[] // Complete file tree
}
