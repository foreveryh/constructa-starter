/**
 * File Part Component
 *
 * Displays files/documents returned by Claude Agent SDK.
 * Implements Assistant UI's FileMessagePartProps interface.
 */

import { DownloadIcon, FileIcon, FileTextIcon } from '@radix-ui/react-icons';
import { type FC } from 'react';

interface FilePartProps {
  filename?: string;
  data: string; // base64 data or URL
  mimeType: string;
  status?: { type: string };
}

// Get icon based on mime type
const getFileIcon = (mimeType?: string) => {
  if (!mimeType) return FileIcon;
  if (mimeType.includes('text') || mimeType.includes('pdf') || mimeType.includes('document')) {
    return FileTextIcon;
  }
  return FileIcon;
};

// Get file extension from mime type or filename
const getFileExtension = (filename?: string, mimeType?: string): string => {
  if (filename) {
    const parts = filename.split('.');
    if (parts.length > 1) return parts.pop()?.toUpperCase() || '';
  }
  if (mimeType) {
    const parts = mimeType.split('/');
    if (parts.length > 1) {
      const ext = parts[1].split(';')[0];
      if (ext && ext !== '*') return ext.toUpperCase();
    }
  }
  return 'FILE';
};

export const FilePart: FC<FilePartProps> = ({
  filename = 'Untitled',
  data,
  mimeType,
}) => {
  const IconComponent = getFileIcon(mimeType);
  const extension = getFileExtension(filename, mimeType);

  // Create download URL - check if it's already a URL or base64
  const downloadUrl = data.startsWith('http') || data.startsWith('data:')
    ? data
    : `data:${mimeType};base64,${data}`;

  return (
    <div className="my-2 flex items-center gap-3 rounded-lg border border-[#e5e4df] bg-[#faf9f7] p-3 dark:border-[#3a3938] dark:bg-[#2b2a27]">
      {/* File icon with extension badge */}
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#e5e4df] dark:bg-[#3a3938]">
        <IconComponent className="h-6 w-6 text-[#6b6a68] dark:text-[#9a9893]" />
        <span className="absolute -bottom-1 -right-1 rounded bg-[#ae5630] px-1 py-0.5 text-[8px] font-bold text-white">
          {extension.slice(0, 4)}
        </span>
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[#1a1a18] dark:text-[#eee]">
          {filename}
        </div>
        <div className="text-xs text-[#6b6a68] dark:text-[#9a9893]">
          {mimeType}
        </div>
      </div>

      {/* Download button */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download={filename}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#e5e4df] bg-white text-[#6b6a68] transition-colors hover:border-[#ae5630] hover:text-[#ae5630] dark:border-[#3a3938] dark:bg-[#1f1e1b] dark:text-[#9a9893] dark:hover:border-[#ae5630] dark:hover:text-[#ae5630]"
          title="Download file"
        >
          <DownloadIcon className="h-4 w-4" />
        </a>
      )}
    </div>
  );
};

export default FilePart;
