import { FC, useEffect, useState } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import { useSkillsStore, type SkillInfo } from '~/lib/skills-store'

interface SkillsManagerPanelProps {
  userId: string
  onClose: () => void
}

export const SkillsManagerPanel: FC<SkillsManagerPanelProps> = ({ userId, onClose }) => {
  const {
    availableSkills,
    enabledSkills,
    isLoading,
    error,
    loadAvailableSkills,
    loadEnabledSkills,
    enableSkill,
    disableSkill,
    clearError,
  } = useSkillsStore()

  // Load data on mount
  useEffect(() => {
    loadAvailableSkills()
    loadEnabledSkills(userId)
  }, [userId, loadAvailableSkills, loadEnabledSkills])

  // Handle toggle switch
  const handleToggle = async (skillSlug: string) => {
    const isEnabled = enabledSkills.includes(skillSlug)
    try {
      if (isEnabled) {
        await disableSkill(userId, skillSlug)
      } else {
        await enableSkill(userId, skillSlug)
      }
    } catch (error) {
      // Error already handled in store
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-96 max-h-[80vh] overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          🔧 Skills 管理
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="关闭"
        >
          <Cross2Icon width={16} height={16} />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        {/* Error Message */}
        {error && (
          <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={clearError}
              className="text-xs text-red-600 dark:text-red-400 underline mt-1"
            >
              关闭
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <p className="text-xs text-gray-500 dark:text-gray-400">加载中...</p>
        )}

        {/* Empty State */}
        {!isLoading && availableSkills.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            暂无可用的 Skills
          </p>
        )}

        {/* Skills List */}
        {!isLoading && availableSkills.length > 0 && (
          <div className="space-y-2">
            {availableSkills.map((skill: SkillInfo) => {
              const isEnabled = enabledSkills.includes(skill.slug)
              return (
                <SkillToggleItem
                  key={skill.slug}
                  skill={skill}
                  isEnabled={isEnabled}
                  onToggle={() => handleToggle(skill.slug)}
                />
              )
            })}
          </div>
        )}

        {/* Footer Info */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            已启用: {enabledSkills.length} / {availableSkills.length}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            提示：开启后需重新发起对话才能使用新 Skills
          </p>
        </div>
      </div>
      </div>
    </div>
  )
}

// Skill Toggle Item Component
interface SkillToggleItemProps {
  skill: SkillInfo
  isEnabled: boolean
  onToggle: () => void
}

const SkillToggleItem: FC<SkillToggleItemProps> = ({ skill, isEnabled, onToggle }) => {
  return (
    <div className="flex items-start justify-between gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {skill.name}
        </p>
        {skill.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {skill.description}
          </p>
        )}
      </div>

      {/* Toggle Switch */}
      <button
        onClick={onToggle}
        className={`
          relative inline-flex h-5 w-9 items-center rounded-full transition-colors
          ${isEnabled
            ? 'bg-blue-600 dark:bg-blue-500'
            : 'bg-gray-300 dark:bg-gray-600'}
        `}
        aria-label={isEnabled ? '关闭' : '开启'}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${isEnabled ? 'translate-x-5' : 'translate-x-0.5'}
          `}
        />
      </button>
    </div>
  )
}
