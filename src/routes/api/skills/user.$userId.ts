/**
 * User Skills API
 *
 * GET /api/skills/user/:userId - Get user's enabled Skills
 */

import { createFileRoute } from '@tanstack/react-router'
import { getUserEnabledSkills } from '~/server/skills/manager'

export const Route = createFileRoute('/api/skills/user/$userId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { userId } = params
          if (!userId) {
            return Response.json(
              { error: 'userId is required' },
              { status: 400 }
            )
          }

          const enabledSkills = await getUserEnabledSkills(userId)
          return Response.json(enabledSkills)
        } catch (error) {
          console.error('[Skills API] Failed to get user enabled skills:', error)
          return Response.json(
            {
              error: 'Failed to get user enabled skills',
              details: (error as Error).message
            },
            { status: 500 }
          )
        }
      },
    },
  },
})
