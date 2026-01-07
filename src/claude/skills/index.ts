/**
 * Claude Skills Module
 *
 * Exports Skills management utilities.
 */

// Types
export type { SkillInfo, SkillCategory } from './types';
export { SKILL_CATEGORIES } from './types';
export type { SkillFile, SkillDetail } from './detail-types';

// Manager functions
export {
  normalizeSkillName,
  getUserClaudeHome,
  getSkillsStore,
  getUserEnabledSkills,
  enableSkill,
  disableSkill,
} from './manager';

// Metadata functions
export { fileExists, parseSkillMetadata } from './metadata';

// Detail functions
export { getSkillDetail } from './detail';
