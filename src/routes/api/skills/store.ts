/**
 * Skills Store API
 *
 * GET /api/skills/store - Get all available Skills from the store
 */

import { createFileRoute } from '@tanstack/react-router'
import { getSkillsStore } from '~/server/skills/manager'

export const Route = createFileRoute('/api/skills/store')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const skills = await getSkillsStore()
          return Response.json(skills)
        } catch (error) {
          console.error('[Skills API] Failed to get skills store:', error)
          return Response.json(
            {
              error: 'Failed to get skills store',
              details: (error as Error).message
            },
            { status: 500 }
          )
        }
      },
    },
  },
})
