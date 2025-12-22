/**
 * Session List Component (Claude Style)
 *
 * Displays a list of chat sessions with Claude.ai styling.
 * Fetches sessions from /api/agent-sessions endpoint.
 */

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, MessageSquare } from 'lucide-react';
import { SessionItem, type SessionItemData } from './session-item';
import { cn } from '~/lib/utils';

interface SessionListResponse {
  sessions: SessionItemData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface SessionListProps {
  currentSessionId: string | null;
  onSelectSession: (sdkSessionId: string) => void;
  onNewSession: () => void;
}

export function SessionList({
  currentSessionId,
  onSelectSession,
  onNewSession,
}: SessionListProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<SessionListResponse>({
    queryKey: ['agent-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/agent-sessions?limit=50');
      if (!res.ok) {
        throw new Error('Failed to fetch sessions');
      }
      return res.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const sessions = data?.sessions ?? [];

  // Handle title update
  const handleUpdateTitle = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/agent-sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        throw new Error('Failed to update title');
      }
      // Invalidate cache to refresh list
      queryClient.invalidateQueries({ queryKey: ['agent-sessions'] });
    } catch (error) {
      console.error('Failed to update session title:', error);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header with New Chat button */}
      <div className="shrink-0 border-b border-[#00000010] p-3 dark:border-[#ffffff10]">
        <button
          type="button"
          onClick={onNewSession}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5',
            'bg-[#ae5630] text-white text-sm font-medium',
            'transition-colors hover:bg-[#c4633a]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630] focus-visible:ring-offset-2'
          )}
        >
          <Plus className="h-4 w-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#6b6a68] dark:text-[#9a9893]" />
          </div>
        ) : error ? (
          <div className="px-3 py-8 text-center text-sm text-[#6b6a68] dark:text-[#9a9893]">
            Failed to load sessions
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center">
            <MessageSquare className="h-8 w-8 text-[#6b6a68]/50 dark:text-[#9a9893]/50" />
            <p className="text-sm text-[#6b6a68] dark:text-[#9a9893]">
              No conversations yet
            </p>
            <p className="text-xs text-[#6b6a68]/70 dark:text-[#9a9893]/70">
              Start a new chat to begin
            </p>
          </div>
        ) : (
          <div className="py-1">
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.sdkSessionId === currentSessionId}
                onClick={() => onSelectSession(session.sdkSessionId)}
                onUpdateTitle={handleUpdateTitle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with session count */}
      {sessions.length > 0 && (
        <div className="shrink-0 border-t border-[#00000010] px-3 py-2 dark:border-[#ffffff10]">
          <p className="text-xs text-[#6b6a68] dark:text-[#9a9893]">
            {sessions.length} conversation{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to invalidate session list cache
 * Call this after creating a new session or updating a session
 */
export function useInvalidateSessions() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['agent-sessions'] });
}
