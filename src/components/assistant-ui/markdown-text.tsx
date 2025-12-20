import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import type { FC } from 'react';

export const MarkdownText: FC = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ae5630] underline underline-offset-2 hover:text-[#c4633a] dark:text-[#d4825e]"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-4 list-disc pl-6 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-4 list-decimal pl-6 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        code: ({ children }) => (
          <code className="rounded bg-[#e5e4df] px-1.5 py-0.5 font-mono text-sm dark:bg-[#3a3938]">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-4 overflow-x-auto rounded-lg bg-[#1a1a18] p-4 text-sm text-[#eee] last:mb-0 dark:bg-[#1f1e1b]">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-4 border-l-2 border-[#ae5630] pl-4 italic text-[#6b6a68] last:mb-0 dark:text-[#9a9893]">
            {children}
          </blockquote>
        ),
        h1: ({ children }) => <h1 className="mb-4 text-2xl font-bold">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-3 text-xl font-bold">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 text-lg font-semibold">{children}</h3>,
        h4: ({ children }) => <h4 className="mb-2 font-semibold">{children}</h4>,
        hr: () => <hr className="my-4 border-[#e5e4df] dark:border-[#3a3938]" />,
      }}
    />
  );
};
