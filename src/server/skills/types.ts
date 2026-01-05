/**
 * Skills Types
 *
 * Type definitions for Skills management
 */

export interface SkillInfo {
  slug: string           // 目录名（唯一标识）
  name: string           // 显示名称
  description: string | null  // 描述
  category: string       // 分类
}

// Category constants
export const SKILL_CATEGORIES = {
  DEVELOPMENT: 'development',
  DESIGN: 'design',
  PRODUCTIVITY: 'productivity',
  INTEGRATION: 'integration',
  GENERAL: 'general',
} as const;

export type SkillCategory = typeof SKILL_CATEGORIES[keyof typeof SKILL_CATEGORIES];
