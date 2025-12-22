/**
 * Session Item Component (Claude Style)
 *
 * Displays a single session in the session list with Claude.ai styling.
 */

import { cn } from '~/lib/utils';
import { Star, MessageSquare } from 'lucide-react';

export interface SessionItemData {
  id: string;
  sdkSessionId: string;
  title: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SessionItemProps {
  session: SessionItemData;
  isActive: boolean;
  onClick: () => void;
}

export function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  const displayTitle = session.title || 'New Chat';
  const timeAgo = formatTimeAgo(session.updatedAt);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 transition-colors duration-150',
        'hover:bg-[#00000008] dark:hover:bg-[#ffffff08]',
        'border-b border-[#00000008] dark:border-[#ffffff08]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ae5630]',
        isActive && 'bg-[#00000010] dark:bg-[#ffffff10]'
      )}
    >
      <div className="flex items-start gap-2">
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#6b6a68] dark:text-[#9a9893]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {session.favorite && (
              <Star className="h-3 w-3 shrink-0 fill-[#ae5630] text-[#ae5630]" />
            )}
            <span
              className={cn(
                'truncate text-sm font-medium',
                isActive
                  ? 'text-[#1a1a18] dark:text-[#eee]'
                  : 'text-[#1a1a18]/80 dark:text-[#eee]/80'
              )}
            >
              {displayTitle}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-[#6b6a68] dark:text-[#9a9893]">
            {timeAgo}
          </div>
        </div>
      </div>
    </button>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
