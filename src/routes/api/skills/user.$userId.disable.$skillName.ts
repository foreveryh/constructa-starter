/**
 * Disable Skill API
 *
 * DELETE /api/skills/user/:userId/disable/:skillName - Disable a Skill for a user
 */

import { createFileRoute } from '@tanstack/react-router'
import { disableSkill } from '~/server/skills/manager'

export const Route = createFileRoute('/api/skills/user/$userId/disable/$skillName')({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        try {
          const { userId, skillName } = params
          if (!userId || !skillName) {
            return Response.json(
              { error: 'userId and skillName are required' },
              { status: 400 }
            )
          }

          await disableSkill(userId, skillName)
          return Response.json({ success: true })
        } catch (error) {
          console.error('[Skills API] Failed to disable skill:', error)
          return Response.json(
            {
              error: 'Failed to disable skill',
              details: (error as Error).message
            },
            { status: 500 }
          )
        }
      },
    },
  },
})
