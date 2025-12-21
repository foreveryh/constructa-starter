/**
 * Bash Tool UI Component
 *
 * Specialized renderer for Bash/shell tool calls.
 * Shows command and output in terminal style.
 */

import { ChevronDownIcon, ChevronRightIcon, CheckCircledIcon, CrossCircledIcon, GearIcon } from '@radix-ui/react-icons';
import { useState, type FC } from 'react';

interface BashToolProps {
  toolCallId: string;
  toolName: string;
  args: {
    command?: string;
    description?: string;
    timeout?: number;
  };
  argsText: string;
  result?: string;
  isError?: boolean;
  status?: { type: string };
}

export const BashTool: FC<BashToolProps> = ({
  args,
  result,
  isError,
  status,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunning = status?.type === 'running';
  const hasResult = result !== undefined;
  const command = args.command || '';
  const description = args.description || '';

  // Truncate command for preview
  const commandPreview = command.length > 50 ? command.slice(0, 50) + '...' : command;

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[#e5e4df] bg-green-50/50 dark:border-[#3a3938] dark:bg-green-950/20">
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

        <span className="text-base">💻</span>

        <span className="font-medium text-green-600 dark:text-green-400">Bash</span>

        <code className="truncate rounded bg-[#1a1a18] px-1.5 py-0.5 font-mono text-xs text-[#eee] dark:bg-[#1f1e1b]">
          {commandPreview}
        </code>

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

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-[#e5e4df] dark:border-[#3a3938]">
          {/* Terminal header */}
          <div className="flex items-center gap-2 bg-[#2d2d2d] px-3 py-1.5">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-[#ff5f56]" />
              <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
              <div className="h-3 w-3 rounded-full bg-[#27c93f]" />
            </div>
            {description && (
              <span className="ml-2 text-xs text-[#9a9893]">{description}</span>
            )}
          </div>

          {/* Command */}
          <div className="bg-[#1a1a18] px-3 py-2 dark:bg-[#1f1e1b]">
            <div className="flex items-start gap-2 font-mono text-xs">
              <span className="select-none text-green-400">$</span>
              <code className="whitespace-pre-wrap break-all text-[#eee]">{command}</code>
            </div>
          </div>

          {/* Output */}
          {hasResult && (
            <pre
              className={`max-h-96 overflow-auto px-3 py-2 font-mono text-xs ${
                isError
                  ? 'bg-[#1a1a18] text-red-400 dark:bg-[#1f1e1b]'
                  : 'bg-[#1a1a18] text-[#ccc] dark:bg-[#1f1e1b]'
              }`}
            >
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default BashTool;
