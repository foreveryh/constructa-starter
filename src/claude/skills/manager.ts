/**
 * Skills Manager
 *
 * Manages Skills enable/disable operations
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SkillInfo } from './types'
import { parseSkillMetadata, fileExists } from './metadata'

/**
 * Normalize skill name to prevent path traversal attacks
 */
export function normalizeSkillName(skillName: string): string {
  return skillName.replace(/[^A-Za-z0-9-_]/g, '_')
}

/**
 * Get user's CLAUDE_HOME directory
 * Uses CLAUDE_SESSIONS_ROOT to be consistent with ws-server.mjs
 */
export function getUserClaudeHome(userId: string): string {
  // Use same root as WebSocket server for consistency
  // Handle both undefined and empty string cases
  const envRoot = process.env.CLAUDE_SESSIONS_ROOT
  const sessionsRoot = (envRoot && envRoot.trim())
    ? envRoot
    : path.join(process.cwd(), 'user-data')
  return path.join(sessionsRoot, userId)
}

/**
 * Get all available Skills from the Skills Store
 */
export async function getSkillsStore(): Promise<SkillInfo[]> {
  const storeDir = path.join(process.cwd(), 'src', 'skills-store')

  try {
    const entries = await fs.readdir(storeDir, { withFileTypes: true })

    const skills = await Promise.all(
      entries
        .filter(e => e.isDirectory())
        .map(async (entry) => {
          const skillPath = path.join(storeDir, entry.name)
          return parseSkillMetadata(skillPath, entry.name)
        })
    )

    return skills.filter((skill): skill is SkillInfo => Boolean(skill))
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      // Skills Store doesn't exist, return empty array
      console.warn('[Skills] Skills Store directory does not exist:', storeDir)
      return []
    }
    throw error
  }
}

/**
 * Get user's enabled Skills
 */
export async function getUserEnabledSkills(userId: string): Promise<string[]> {
  const skillsDir = path.join(getUserClaudeHome(userId), '.claude', 'skills')

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      // .claude/skills/ doesn't exist, return empty array
      return []
    }
    throw error
  }
}

/**
 * Enable a Skill for a user
 */
export async function enableSkill(userId: string, skillName: string): Promise<void> {
  const normalizedName = normalizeSkillName(skillName)
  const sourceDir = path.join(process.cwd(), 'src', 'skills-store', normalizedName)
  const userHome = getUserClaudeHome(userId)
  const targetDir = path.join(userHome, '.claude', 'skills', normalizedName)

  // 1. Verify source exists
  if (!await fileExists(sourceDir)) {
    throw new Error(`Skill not found in store: ${normalizedName}`)
  }

  // 2. Delete old version if exists (auto-update strategy)
  await fs.rm(targetDir, { recursive: true, force: true })

  // 3. Create parent directory
  await fs.mkdir(path.dirname(targetDir), { recursive: true })

  // 4. Copy Skill directory
  await fs.cp(sourceDir, targetDir, { recursive: true })

  console.log(`[Skills] Enabled skill: ${normalizedName} for user: ${userId}`)
}

/**
 * Disable a Skill for a user
 */
export async function disableSkill(userId: string, skillName: string): Promise<void> {
  const normalizedName = normalizeSkillName(skillName)
  const targetDir = path.join(getUserClaudeHome(userId), '.claude', 'skills', normalizedName)

  // 1. Delete directory
  await fs.rm(targetDir, { recursive: true, force: true })

  // 2. Verify deletion succeeded
  const stillExists = await fileExists(targetDir)
  if (stillExists) {
    throw new Error('Failed to disable skill: directory still exists after deletion')
  }

  console.log(`[Skills] Disabled skill: ${normalizedName} for user: ${userId}`)
}
