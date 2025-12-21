/**
 * Tool Call Part Component
 *
 * Displays tool invocations with their arguments and results.
 * Provides expandable details and status indicators.
 */

import { CheckCircledIcon, ChevronDownIcon, ChevronRightIcon, CrossCircledIcon, GearIcon } from '@radix-ui/react-icons';
import { useState, type FC } from 'react';

interface ToolCallPartProps {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  isError?: boolean;
  status?: { type: string };
}

// Tool-specific icons and colors
const getToolStyle = (toolName: string) => {
  const name = toolName.toLowerCase();

  if (name.includes('read') || name.includes('glob') || name.includes('grep')) {
    return { icon: '📄', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' };
  }
  if (name.includes('write') || name.includes('edit')) {
    return { icon: '✏️', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' };
  }
  if (name.includes('bash') || name.includes('shell') || name.includes('exec')) {
    return { icon: '💻', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30' };
  }
  if (name.includes('web') || name.includes('fetch') || name.includes('search')) {
    return { icon: '🌐', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30' };
  }
  if (name.includes('task') || name.includes('agent')) {
    return { icon: '🤖', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/30' };
  }

  return { icon: '🔧', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900/30' };
};

// Format tool arguments for display
const formatArgs = (args: Record<string, unknown>, toolName: string): string => {
  const name = toolName.toLowerCase();

  // Special formatting for common tools
  if ((name.includes('read') || name.includes('write') || name.includes('edit')) && args.file_path) {
    return String(args.file_path);
  }
  if (name.includes('bash') && args.command) {
    const cmd = String(args.command);
    return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
  }
  if (name.includes('glob') && args.pattern) {
    return String(args.pattern);
  }
  if (name.includes('grep') && args.pattern) {
    return `"${args.pattern}"`;
  }

  // Default: show first key-value or truncated JSON
  const keys = Object.keys(args);
  if (keys.length === 0) return '';
  if (keys.length === 1) {
    const val = String(args[keys[0]]);
    return val.length > 50 ? val.slice(0, 50) + '...' : val;
  }
  return `${keys.length} params`;
};

export const ToolCallPart: FC<ToolCallPartProps> = ({
  toolName,
  args,
  argsText,
  result,
  isError,
  status,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunning = status?.type === 'running';
  const hasResult = result !== undefined;
  const style = getToolStyle(toolName);

  return (
    <div className={`my-2 overflow-hidden rounded-lg border border-[#e5e4df] dark:border-[#3a3938] ${style.bg}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
      >
        {isExpanded ? (
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-[#6b6a68] dark:text-[#9a9893]" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-[#6b6a68] dark:text-[#9a9893]" />
        )}

        <span className="text-base">{style.icon}</span>

        <span className={`font-medium ${style.color}`}>{toolName}</span>

        <span className="truncate text-xs text-[#6b6a68] dark:text-[#9a9893]">
          {formatArgs(args, toolName)}
        </span>

        <span className="ml-auto flex items-center gap-1">
          {isRunning && (
            <GearIcon className="h-4 w-4 animate-spin text-[#ae5630]" />
          )}
          {hasResult && !isError && (
            <CheckCircledIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
          )}
          {hasResult && isError && (
            <CrossCircledIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
          )}
        </span>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="space-y-2 border-t border-[#e5e4df] px-3 py-2 dark:border-[#3a3938]">
          {/* Arguments */}
          <div>
            <div className="mb-1 text-xs font-medium text-[#6b6a68] dark:text-[#9a9893]">
              Arguments
            </div>
            <pre className="overflow-x-auto rounded bg-[#1a1a18] p-2 font-mono text-xs text-[#eee] dark:bg-[#1f1e1b]">
              {argsText || JSON.stringify(args, null, 2)}
            </pre>
          </div>

          {/* Result */}
          {hasResult && (
            <div>
              <div className="mb-1 text-xs font-medium text-[#6b6a68] dark:text-[#9a9893]">
                {isError ? 'Error' : 'Result'}
              </div>
              <pre
                className={`max-h-64 overflow-auto rounded p-2 font-mono text-xs ${
                  isError
                    ? 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200'
                    : 'bg-[#1a1a18] text-[#eee] dark:bg-[#1f1e1b]'
                }`}
              >
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCallPart;
