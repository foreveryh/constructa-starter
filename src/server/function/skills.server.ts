/**
 * Skills Server Functions
 *
 * Server functions for Skills management using TanStack Start
 */

import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { auth } from '~/server/auth.server';
import {
  getSkillsStore,
  getUserEnabledSkills,
  enableSkill,
  disableSkill,
  getSkillDetail,
  type SkillInfo,
  type SkillDetail,
} from '~/claude/skills';

const requireUser = async () => {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });

  if (!session?.user) {
    throw new Error('UNAUTHORIZED');
  }

  return session.user;
};

// Input validation schemas
const enableSkillSchema = z.object({
  skillName: z.string().min(1),
});

const disableSkillSchema = z.object({
  skillName: z.string().min(1),
});

const getSkillDetailSchema = z.object({
  skillSlug: z.string().min(1),
});

export type EnableSkillInput = z.infer<typeof enableSkillSchema>;
export type DisableSkillInput = z.infer<typeof disableSkillSchema>;

/**
 * List all available skills from the store
 * No authentication required - this is just the catalog
 */
export const listSkillsStore = createServerFn({ method: 'GET' }).handler(async () => {
  return await getSkillsStore();
});

/**
 * Get user's enabled skills
 * Authentication required
 */
export const listUserSkills = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser();
  const enabledSlugs = await getUserEnabledSkills(user.id);
  const allSkills = await getSkillsStore();

  // Return full skill info for enabled skills only
  return allSkills.filter((skill) => enabledSlugs.includes(skill.slug));
});

/**
 * Enable a skill for the user
 * Authentication required
 */
export const enableUserSkill = createServerFn({ method: 'POST' })
  .inputValidator((input) => {
    // Normalize input like documents.server.ts does
    const payload =
      typeof input === 'string' ? JSON.parse(input) : input;
    const data = payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data?: unknown }).data
      : payload;
    return enableSkillSchema.parse(data);
  })
  .handler(async ({ data }) => {
    const user = await requireUser();
    await enableSkill(user.id, data.skillName);
    return { success: true };
  });

/**
 * Disable a skill for the user
 * Authentication required
 */
export const disableUserSkill = createServerFn({ method: 'POST' })
  .inputValidator((input) => {
    // Normalize input like documents.server.ts does
    const payload =
      typeof input === 'string' ? JSON.parse(input) : input;
    const data = payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data?: unknown }).data
      : payload;
    return disableSkillSchema.parse(data);
  })
  .handler(async ({ data }) => {
    const user = await requireUser();
    await disableSkill(user.id, data.skillName);
    return { success: true };
  });

/**
 * Get full Skill detail including all files
 * No authentication required - this is public information
 */
export const getSkillDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => {
    // Handle both URL params and query string
    const searchParams = typeof input === 'string' ? new URLSearchParams(input) : null;
    const skillSlug = searchParams?.get('skillSlug') || (typeof input === 'object' && input && 'skillSlug' in input ? (input as { skillSlug?: string }).skillSlug : null);
    return getSkillDetailSchema.parse({ skillSlug });
  })
  .handler(async ({ data }) => {
    return await getSkillDetail(data.skillSlug);
  });
