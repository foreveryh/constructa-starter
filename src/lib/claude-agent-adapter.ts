/**
 * Claude Agent Adapter
 *
 * Implements ChatModelAdapter for Assistant UI, connecting to /api/agent-chat
 * which streams Claude Agent SDK events.
 *
 * Architecture:
 * - Single layer of event transformation (SDK events → Assistant UI format)
 * - Backend passes through raw SDK events via SSE
 * - This adapter handles all parsing and state management
 *
 * SDK Event Types:
 * - system (init): Session initialization
 * - assistant: Text, thinking, tool_use content blocks
 * - user: Tool results (tool_result content blocks)
 * - result: Final result or error
 */

import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult } from '@assistant-ui/react';

// SDK Message Types (simplified, matching what /api/agent-chat streams)
type SDKContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown };

type SDKMessage = {
  type: 'system' | 'assistant' | 'user' | 'result' | 'error';
  subtype?: string;
  uuid?: string;
  session_id?: string;
  message?: {
    content: SDKContentBlock[];
  };
  result?: string;
  is_error?: boolean;
  error?: string;
};

// Assistant UI Part Types (matching ThreadAssistantMessagePart)
type TextPart = {
  readonly type: 'text';
  readonly text: string;
};

type ReasoningPart = {
  readonly type: 'reasoning';
  readonly text: string;
};

type ToolCallPart = {
  readonly type: 'tool-call';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly argsText: string;
  readonly result?: unknown;
  readonly isError?: boolean;
};

// Union type matching ThreadAssistantMessagePart
type ContentPart = TextPart | ReasoningPart | ToolCallPart;

// Session storage for multi-turn conversations
let currentSessionId: string | undefined;

export function getSessionId(): string | undefined {
  return currentSessionId;
}

export function setSessionId(id: string | undefined): void {
  currentSessionId = id;
}

export function clearSession(): void {
  currentSessionId = undefined;
}

/**
 * Claude Agent Adapter for Assistant UI
 *
 * Usage:
 * ```tsx
 * import { useLocalRuntime, AssistantRuntimeProvider } from '@assistant-ui/react';
 * import { ClaudeAgentAdapter } from '~/lib/claude-agent-adapter';
 *
 * function ChatComponent() {
 *   const runtime = useLocalRuntime(ClaudeAgentAdapter);
 *   return (
 *     <AssistantRuntimeProvider runtime={runtime}>
 *       {/* UI components *\/}
 *     </AssistantRuntimeProvider>
 *   );
 * }
 * ```
 */
export const ClaudeAgentAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }: ChatModelRunOptions) {
    // 1. Extract the latest user message
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('No user message to process');
    }

    const textParts = lastMessage.content.filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text'
    );
    const prompt = textParts.map((p) => p.text).join('\n');

    if (!prompt.trim()) {
      throw new Error('Empty prompt');
    }

    // 2. Call the backend API
    const response = await fetch('/api/agent-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        sessionId: currentSessionId,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    // 3. Parse SSE stream
    const decoder = new TextDecoder();
    let buffer = '';
    const content: ContentPart[] = [];
    const toolCalls = new Map<string, ToolCallPart>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as SDKMessage;

            switch (event.type) {
              case 'system':
                // Save session_id for resume
                if (event.subtype === 'init' && event.session_id) {
                  currentSessionId = event.session_id;
                }
                break;

              case 'assistant':
                if (event.message?.content) {
                  for (const block of event.message.content) {
                    switch (block.type) {
                      case 'text':
                        if (block.text) {
                          // Find existing text part or create new one
                          let existingText = content.find(
                            (p): p is TextPart => p.type === 'text'
                          );
                          if (existingText) {
                            // Replace with accumulated text
                            const index = content.indexOf(existingText);
                            content[index] = { type: 'text', text: block.text };
                          } else {
                            content.push({ type: 'text', text: block.text });
                          }
                        }
                        break;

                      case 'thinking':
                        // Note: SDK currently hides thinking blocks (GitHub Issue #25)
                        // This code is here for future compatibility
                        if (block.thinking) {
                          content.push({
                            type: 'reasoning',
                            text: block.thinking,
                          });
                        }
                        break;

                      case 'tool_use':
                        if (block.id && block.name) {
                          const toolPart: ToolCallPart = {
                            type: 'tool-call',
                            toolCallId: block.id,
                            toolName: block.name,
                            args: (block.input as Record<string, unknown>) ?? {},
                            argsText: JSON.stringify(block.input ?? {}),
                          };
                          toolCalls.set(block.id, toolPart);
                          content.push(toolPart);
                        }
                        break;
                    }
                  }

                  // Yield intermediate result
                  yield {
                    content: [...content] as ChatModelRunResult['content'],
                    status: { type: 'running' },
                  } satisfies ChatModelRunResult;
                }
                break;

              case 'user':
                // Tool results come in user messages
                if (event.message?.content) {
                  for (const block of event.message.content) {
                    if (block.type === 'tool_result' && block.tool_use_id) {
                      const toolPart = toolCalls.get(block.tool_use_id);
                      if (toolPart) {
                        // Update tool call with result
                        const updatedPart: ToolCallPart = {
                          ...toolPart,
                          result: block.content,
                          isError: false,
                        };
                        toolCalls.set(block.tool_use_id, updatedPart);

                        // Update in content array
                        const index = content.findIndex(
                          (p) =>
                            p.type === 'tool-call' &&
                            p.toolCallId === block.tool_use_id
                        );
                        if (index !== -1) {
                          content[index] = updatedPart;
                        }
                      }
                    }
                  }

                  // Yield after tool result
                  yield {
                    content: [...content] as ChatModelRunResult['content'],
                    status: { type: 'running' },
                  } satisfies ChatModelRunResult;
                }
                break;

              case 'result':
                // Handle final result
                if (event.is_error || event.subtype?.startsWith('error')) {
                  throw new Error(event.result || 'Agent execution failed');
                }
                break;

              case 'error':
                throw new Error(event.error || 'Unknown error');
            }
          } catch (parseError) {
            // Skip JSON parse errors (incomplete data)
            if (!(parseError instanceof SyntaxError)) {
              throw parseError;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // 4. Yield final result
    yield {
      content: (content.length > 0 ? content : [{ type: 'text', text: '' }]) as ChatModelRunResult['content'],
      status: { type: 'complete', reason: 'stop' },
    } satisfies ChatModelRunResult;
  },
};

export default ClaudeAgentAdapter;
