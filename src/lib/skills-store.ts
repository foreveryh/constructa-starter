/**
 * Skills Store
 *
 * Manages Skills state for the application
 */

import { create } from 'zustand'

// Skills information
export interface SkillInfo {
  slug: string           // Directory name (unique identifier)
  name: string           // Display name
  description: string | null  // Description
}

// Store state
interface SkillsStore {
  // All available Skills from the store
  availableSkills: SkillInfo[]

  // User's enabled Skills (only store slugs)
  enabledSkills: string[]

  // Loading state
  isLoading: boolean

  // Error state
  error: string | null

  // Actions
  loadAvailableSkills: () => Promise<void>
  loadEnabledSkills: (userId: string) => Promise<void>
  enableSkill: (userId: string, skillName: string) => Promise<void>
  disableSkill: (userId: string, skillName: string) => Promise<void>
  clearError: () => void
}

export const useSkillsStore = create<SkillsStore>((set, get) => ({
  availableSkills: [],
  enabledSkills: [],
  isLoading: false,
  error: null,

  clearError: () => {
    set({ error: null })
  },

  loadAvailableSkills: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch('/api/skills/store')
      if (!response.ok) {
        throw new Error('Failed to fetch skills store')
      }
      const data = await response.json()
      set({ availableSkills: data })
    } catch (error) {
      console.error('[Skills Store] Failed to load available skills:', error)
      set({ error: (error as Error).message })
    } finally {
      set({ isLoading: false })
    }
  },

  loadEnabledSkills: async (userId: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`/api/skills/user/${userId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch enabled skills')
      }
      const data = await response.json()
      set({ enabledSkills: data })
    } catch (error) {
      console.error('[Skills Store] Failed to load enabled skills:', error)
      set({ error: (error as Error).message })
    } finally {
      set({ isLoading: false })
    }
  },

  enableSkill: async (userId: string, skillName: string) => {
    // 1. Optimistic update
    const previousState = get().enabledSkills
    set(state => ({
      enabledSkills: [...state.enabledSkills, skillName],
      error: null
    }))

    try {
      // 2. Call API
      const response = await fetch(`/api/skills/user/${userId}/enable/${skillName}`, {
        method: 'POST'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.details || data.error || 'Failed to enable skill')
      }

      console.log(`[Skills Store] Successfully enabled skill: ${skillName}`)
    } catch (error) {
      // 3. Rollback on error
      console.error('[Skills Store] Failed to enable skill:', error)
      set({
        enabledSkills: previousState,
        error: `开启 Skill 失败: ${(error as Error).message}`
      })
      throw error
    }
  },

  disableSkill: async (userId: string, skillName: string) => {
    // 1. Optimistic update
    const previousState = get().enabledSkills
    set(state => ({
      enabledSkills: state.enabledSkills.filter(s => s !== skillName),
      error: null
    }))

    try {
      // 2. Call API
      const response = await fetch(`/api/skills/user/${userId}/disable/${skillName}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.details || data.error || 'Failed to disable skill')
      }

      console.log(`[Skills Store] Successfully disabled skill: ${skillName}`)
    } catch (error) {
      // 3. Rollback on error
      console.error('[Skills Store] Failed to disable skill:', error)
      set({
        enabledSkills: previousState,
        error: `关闭 Skill 失败: ${(error as Error).message}`
      })
      throw error
    }
  },
}))
