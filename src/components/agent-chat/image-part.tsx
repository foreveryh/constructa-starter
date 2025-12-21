/**
 * Image Part Component
 *
 * Displays images returned by Claude Agent SDK.
 * Implements Assistant UI's ImageMessagePartProps interface.
 */

import { useState, type FC } from 'react';

interface ImagePartProps {
  image: string; // URL or data:URL
  filename?: string;
  status?: { type: string };
}

export const ImagePart: FC<ImagePartProps> = ({
  image,
  filename,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (!image) {
    return (
      <div className="my-2 flex items-center justify-center rounded-lg border border-dashed border-[#e5e4df] bg-[#faf9f7] p-4 text-sm text-[#6b6a68] dark:border-[#3a3938] dark:bg-[#2b2a27] dark:text-[#9a9893]">
        No image source available
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="my-2 flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
        Failed to load image
      </div>
    );
  }

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="group relative overflow-hidden rounded-lg border border-[#e5e4df] transition-all hover:border-[#ae5630] dark:border-[#3a3938] dark:hover:border-[#ae5630]"
      >
        <img
          src={image}
          alt={filename || 'AI generated image'}
          onError={() => setHasError(true)}
          className={`transition-all ${
            isExpanded ? 'max-h-[80vh] max-w-full' : 'max-h-64 max-w-sm'
          } object-contain`}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#1a1a18] dark:bg-[#1f1e1b]/90 dark:text-[#eee]">
            {isExpanded ? 'Click to shrink' : 'Click to expand'}
          </span>
        </div>
      </button>
      {filename && (
        <div className="mt-1 text-xs text-[#6b6a68] dark:text-[#9a9893]">
          {filename}
        </div>
      )}
    </div>
  );
};

export default ImagePart;
