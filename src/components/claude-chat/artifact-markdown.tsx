/**
 * Markdown Artifact Renderer
 *
 * Renders Markdown content with syntax highlighting and styling.
 */

import type { FC } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { useState, useEffect } from 'react'

export interface MarkdownArtifactProps {
  content: string
  title?: string
}

export const MarkdownArtifact: FC<MarkdownArtifactProps> = ({ content }) => {
  // Detect dark mode
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark')
    }
    return false
  })

  useEffect(() => {
    if (typeof document === 'undefined') return

    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="artifact-markdown-content h-full w-full overflow-auto bg-white p-6 dark:bg-[#1a1a18]">
      <div className="prose prose-slate max-w-none dark:prose-invert">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-4 leading-relaxed text-[#1a1a18] last:mb-0 dark:text-[#eee]">
                {children}
              </p>
            ),
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
            ul: ({ children }) => (
              <ul className="mb-4 list-disc pl-6 last:mb-0">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-4 list-decimal pl-6 last:mb-0">{children}</ol>
            ),
            li: ({ children }) => <li className="mb-1">{children}</li>,
            code: ({ node, inline, className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '')
              const language = match ? match[1] : ''

              // Code block with syntax highlighting
              if (!inline && language) {
                return (
                  <SyntaxHighlighter
                    style={isDark ? oneDark : oneLight}
                    language={language}
                    PreTag="div"
                    className="mb-4 last:mb-0 !rounded-lg !text-sm"
                    customStyle={{
                      margin: 0,
                      padding: '1rem',
                    }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                )
              }

              // Inline code
              return (
                <code
                  className="rounded bg-[#e5e4df] px-1.5 py-0.5 font-mono text-sm text-[#1a1a18] dark:bg-[#3a3938] dark:text-[#eee]"
                  {...props}
                >
                  {children}
                </code>
              )
            },
            pre: ({ children }) => <>{children}</>,
            blockquote: ({ children }) => (
              <blockquote className="mb-4 border-l-4 border-[#ae5630] pl-4 italic text-[#6b6a68] last:mb-0 dark:border-[#d4825e] dark:text-[#9a9893]">
                {children}
              </blockquote>
            ),
            h1: ({ children }) => (
              <h1 className="mb-4 text-3xl font-bold text-[#1a1a18] dark:text-[#eee]">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-3 text-2xl font-bold text-[#1a1a18] dark:text-[#eee]">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-2 text-xl font-semibold text-[#1a1a18] dark:text-[#eee]">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="mb-2 text-lg font-semibold text-[#1a1a18] dark:text-[#eee]">
                {children}
              </h4>
            ),
            h5: ({ children }) => (
              <h5 className="mb-2 font-semibold text-[#1a1a18] dark:text-[#eee]">{children}</h5>
            ),
            h6: ({ children }) => (
              <h6 className="mb-2 font-semibold text-[#1a1a18] dark:text-[#eee]">{children}</h6>
            ),
            hr: () => <hr className="my-6 border-[#e5e4df] dark:border-[#3a3938]" />,
            table: ({ children }) => (
              <div className="mb-4 overflow-x-auto last:mb-0">
                <table className="min-w-full border-collapse border border-[#e5e4df] dark:border-[#3a3938]">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-[#f5f4f0] dark:bg-[#2b2a27]">{children}</thead>
            ),
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => (
              <tr className="border-b border-[#e5e4df] dark:border-[#3a3938]">{children}</tr>
            ),
            th: ({ children }) => (
              <th className="border border-[#e5e4df] px-4 py-2 text-left font-semibold dark:border-[#3a3938]">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-[#e5e4df] px-4 py-2 dark:border-[#3a3938]">
                {children}
              </td>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
