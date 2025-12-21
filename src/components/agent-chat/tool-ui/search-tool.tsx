/**
 * Search Tool UI Component
 *
 * Specialized renderer for Glob/Grep search tool calls.
 * Shows pattern and matching results in a list format.
 */

import { ChevronDownIcon, ChevronRightIcon, CheckCircledIcon, GearIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { useState, type FC } from 'react';

interface SearchToolProps {
  toolCallId: string;
  toolName: string;
  args: {
    pattern?: string;
    path?: string;
    glob?: string;
    type?: string;
    output_mode?: string;
  };
  argsText: string;
  result?: string;
  isError?: boolean;
  status?: { type: string };
}

// Parse search results into structured format
const parseSearchResults = (result: string): string[] => {
  if (!result) return [];
  return result
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, 50); // Limit to 50 results for display
};

export const SearchTool: FC<SearchToolProps> = ({
  toolName,
  args,
  result,
  isError,
  status,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunning = status?.type === 'running';
  const hasResult = result !== undefined;

  const isGlob = toolName.toLowerCase().includes('glob');
  const pattern = args.pattern || args.glob || '';
  const searchPath = args.path || '.';

  const results = hasResult && typeof result === 'string' ? parseSearchResults(result) : [];
  const resultCount = results.length;
  const hasMoreResults = result && typeof result === 'string' && result.split('\n').length > 50;

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[#e5e4df] bg-purple-50/50 dark:border-[#3a3938] dark:bg-purple-950/20">
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

        <MagnifyingGlassIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />

        <span className="font-medium text-purple-600 dark:text-purple-400">
          {isGlob ? 'Glob' : 'Grep'}
        </span>

        <code className="truncate rounded bg-purple-100 px-1.5 py-0.5 font-mono text-xs text-purple-800 dark:bg-purple-900/50 dark:text-purple-200">
          {pattern}
        </code>

        {hasResult && !isError && (
          <span className="text-xs text-[#6b6a68] dark:text-[#9a9893]">
            ({resultCount}{hasMoreResults ? '+' : ''} matches)
          </span>
        )}

        <span className="ml-auto flex items-center gap-1">
          {isRunning && (
            <GearIcon className="h-4 w-4 animate-spin text-[#ae5630]" />
          )}
          {hasResult && !isError && (
            <CheckCircledIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
          )}
        </span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-[#e5e4df] dark:border-[#3a3938]">
          {/* Search info */}
          <div className="flex items-center gap-4 bg-[#1a1a18] px-3 py-1.5 text-xs dark:bg-[#1f1e1b]">
            <span className="text-[#9a9893]">
              Pattern: <code className="text-purple-400">{pattern}</code>
            </span>
            {searchPath !== '.' && (
              <span className="text-[#9a9893]">
                Path: <code className="text-[#eee]">{searchPath}</code>
              </span>
            )}
          </div>

          {/* Results list */}
          {hasResult && (
            <div className="max-h-64 overflow-auto bg-[#1a1a18] dark:bg-[#1f1e1b]">
              {isError ? (
                <div className="px-3 py-2 text-xs text-red-400">
                  {typeof result === 'string' ? result : JSON.stringify(result)}
                </div>
              ) : results.length > 0 ? (
                <ul className="divide-y divide-[#3a3938]">
                  {results.map((item, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs text-[#eee] hover:bg-white/5"
                    >
                      <span className="w-6 shrink-0 text-right text-[#6b6a68]">
                        {index + 1}
                      </span>
                      <span className="truncate">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-3 py-2 text-xs text-[#6b6a68]">
                  No matches found
                </div>
              )}
              {hasMoreResults && (
                <div className="border-t border-[#3a3938] px-3 py-1.5 text-xs text-[#6b6a68]">
                  ... and more results
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchTool;
