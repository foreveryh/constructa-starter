/**
 * Session List Component
 *
 * Displays a list of chat sessions.
 * Fetches sessions from /api/agent-sessions endpoint.
 * Supports expand/collapse functionality for better space utilization.
 */

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, MessageSquare, ChevronRight, ChevronLeft } from 'lucide-react';
import { SessionItem, type SessionItemData } from './session-item';
import { cn } from '~/lib/utils';
import { useState, useEffect } from 'react';

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

  // Expand/collapse state with localStorage persistence
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sessionListExpanded');
      return saved ? JSON.parse(saved) : false; // Default collapsed
    }
    return false;
  });

  // Save state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sessionListExpanded', JSON.stringify(isExpanded));
    }
  }, [isExpanded]);

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

  // Handle session deletion
  const handleDelete = async (id: string) => {
    try {
      // Find the session being deleted
      const sessionToDelete = sessions.find((s) => s.id === id);
      const isCurrentSession = sessionToDelete?.sdkSessionId === currentSessionId;

      const res = await fetch(`/api/agent-sessions/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete session');
      }

      // Invalidate cache to refresh list
      queryClient.invalidateQueries({ queryKey: ['agent-sessions'] });

      // If we deleted the current session, create a new one
      if (isCurrentSession) {
        onNewSession();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error; // Re-throw to let SessionItem handle the error
    }
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col transition-all duration-300 ease-in-out border-r bg-background/50',
        isExpanded ? 'w-64' : 'w-12'
      )}
    >
      {/* Expand/Collapse Toggle Button */}
      <div className="shrink-0 flex items-center justify-center border-b p-2">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg transition-all',
            'hover:bg-sidebar-accent',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label={isExpanded ? '收起会话列表' : '展开会话列表'}
          title={isExpanded ? '收起会话列表' : '展开会话列表'}
        >
          {isExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>

      {isExpanded ? (
        <>
          {/* Header with New Chat button */}
          <div className="shrink-0 border-b p-3">
            <button
              type="button"
              onClick={onNewSession}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5',
                'bg-primary text-primary-foreground text-sm font-medium',
                'transition-colors hover:bg-primary/90',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              )}
            >
              <Plus className="h-4 w-4" />
              <span>New Chat</span>
            </button>
          </div>

          {/* Session list - fixed height with scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
                Failed to load sessions
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No conversations yet
                </p>
                <p className="text-xs text-muted-foreground/70">
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
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer with session count */}
          {sessions.length > 0 && (
            <div className="shrink-0 border-t px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {sessions.length} conversation{sessions.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Collapsed state: New Chat icon button */}
          <div className="flex flex-col items-center gap-2 py-3">
            <button
              type="button"
              onClick={onNewSession}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                'bg-primary text-primary-foreground',
                'transition-colors hover:bg-primary/90',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              )}
              aria-label="新建会话"
              title="新建会话"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Session count indicator */}
          {sessions.length > 0 && (
            <div className="mt-auto px-2 pb-3">
              <div className="flex items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  {sessions.length}
                </span>
              </div>
            </div>
          )}
        </>
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
