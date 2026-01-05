/**
 * Enable Skill API
 *
 * POST /api/skills/user/:userId/enable/:skillName - Enable a Skill for a user
 */

import { createFileRoute } from '@tanstack/react-router'
import { enableSkill } from '~/server/skills/manager'

export const Route = createFileRoute('/api/skills/user/$userId/enable/$skillName')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const { userId, skillName } = params
          if (!userId || !skillName) {
            return Response.json(
              { error: 'userId and skillName are required' },
              { status: 400 }
            )
          }

          await enableSkill(userId, skillName)
          return Response.json({ success: true })
        } catch (error) {
          console.error('[Skills API] Failed to enable skill:', error)
          return Response.json(
            {
              error: 'Failed to enable skill',
              details: (error as Error).message
            },
            { status: 500 }
          )
        }
      },
    },
  },
})
