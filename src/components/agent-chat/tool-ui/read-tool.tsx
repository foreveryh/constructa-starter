/**
 * Read Tool UI Component
 *
 * Specialized renderer for Read file tool calls.
 * Shows file path and content preview with syntax highlighting hints.
 */

import { ChevronDownIcon, ChevronRightIcon, CheckCircledIcon, GearIcon } from '@radix-ui/react-icons';
import { useState, type FC } from 'react';

interface ReadToolProps {
  toolCallId: string;
  toolName: string;
  args: {
    file_path?: string;
    offset?: number;
    limit?: number;
  };
  argsText: string;
  result?: string;
  isError?: boolean;
  status?: { type: string };
}

// Get language hint from file extension
const getLanguageFromPath = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'fish',
    dockerfile: 'dockerfile',
    toml: 'toml',
    ini: 'ini',
    env: 'dotenv',
  };
  return langMap[ext] || 'plaintext';
};

// Get filename from path
const getFileName = (filePath: string): string => {
  return filePath.split('/').pop() || filePath;
};

export const ReadTool: FC<ReadToolProps> = ({
  args,
  result,
  isError,
  status,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunning = status?.type === 'running';
  const hasResult = result !== undefined;
  const filePath = args.file_path || 'Unknown file';
  const fileName = getFileName(filePath);
  const language = getLanguageFromPath(filePath);

  // Count lines in result
  const lineCount = result ? result.split('\n').length : 0;

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[#e5e4df] bg-blue-50/50 dark:border-[#3a3938] dark:bg-blue-950/20">
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

        <span className="text-base">📄</span>

        <span className="font-medium text-blue-600 dark:text-blue-400">Read</span>

        <span className="truncate text-xs text-[#6b6a68] dark:text-[#9a9893]">
          {fileName}
        </span>

        {hasResult && !isError && (
          <span className="text-xs text-[#6b6a68] dark:text-[#9a9893]">
            ({lineCount} lines)
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
          {/* File path */}
          <div className="bg-[#1a1a18] px-3 py-1.5 font-mono text-xs text-[#9a9893] dark:bg-[#1f1e1b]">
            {filePath}
            {args.offset !== undefined && (
              <span className="ml-2 text-[#6b6a68]">
                (lines {args.offset + 1}-{args.offset + (args.limit || 0)})
              </span>
            )}
          </div>

          {/* File content */}
          {hasResult && (
            <pre
              className={`max-h-96 overflow-auto p-3 font-mono text-xs ${
                isError
                  ? 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200'
                  : 'bg-[#1a1a18] text-[#eee] dark:bg-[#1f1e1b]'
              }`}
              data-language={language}
            >
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default ReadTool;
