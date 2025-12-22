/**
 * Chat Session Store
 *
 * Manages message state for chat sessions, supporting:
 * - Loading historical messages from server
 * - Real-time streaming of new messages
 * - Session switching
 */

import { create } from 'zustand';

// Define our own message types that are compatible with @assistant-ui/react
export type TextContentPart = {
  readonly type: 'text';
  readonly text: string;
};

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ThreadMessage {
  id: string;
  role: MessageRole;
  content: TextContentPart[];
  createdAt?: Date;
  status?: {
    type: 'complete' | 'running' | 'requires-action' | 'incomplete';
    reason?: string;
  };
}

// SDK message type (from server)
type SDKContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown };

export type SDKMessage = {
  type: 'system' | 'assistant' | 'user' | 'result' | 'error';
  subtype?: string;
  uuid?: string;
  session_id?: string;
  message?: {
    role?: string;
    content: SDKContentBlock[] | string;
  };
  result?: string;
  is_error?: boolean;
  error?: string;
};

interface ChatSessionState {
  // Current session ID
  currentSessionId: string | null;

  // Messages for current session
  messages: ThreadMessage[];

  // Whether a query is in progress
  isRunning: boolean;

  // Actions
  setSessionId: (sessionId: string | null) => void;
  setMessages: (messages: ThreadMessage[]) => void;
  addMessage: (message: ThreadMessage) => void;
  updateLastMessage: (content: TextContentPart[]) => void;
  setIsRunning: (isRunning: boolean) => void;
  clearMessages: () => void;

  // Load historical messages from SDK format
  loadHistoricalMessages: (sdkMessages: SDKMessage[]) => void;
}

/**
 * Generate a unique message ID
 */
function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert SDK message to ThreadMessage format
 */
function convertSDKMessage(sdkMessage: SDKMessage): ThreadMessage | null {
  const { type, message, uuid } = sdkMessage;

  if (!message) return null;

  // Handle user messages
  if (type === 'user') {
    const content = message.content;

    // Handle tool_result - skip these as they're tool responses
    if (Array.isArray(content)) {
      const hasToolResult = content.some((b) => b.type === 'tool_result');
      if (hasToolResult) return null;

      // Handle text content in array
      const textContent = content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      if (!textContent) return null;

      return {
        id: uuid || generateId(),
        role: 'user' as const,
        content: [{ type: 'text' as const, text: textContent }],
        createdAt: new Date(),
      };
    }

    // Handle string content
    if (typeof content === 'string') {
      return {
        id: uuid || generateId(),
        role: 'user' as const,
        content: [{ type: 'text' as const, text: content }],
        createdAt: new Date(),
      };
    }
  }

  // Handle assistant messages
  if (type === 'assistant' && message.content) {
    const content = message.content;
    if (!Array.isArray(content)) return null;

    const parts: TextContentPart[] = [];

    for (const block of content) {
      if (block.type === 'text' && block.text) {
        parts.push({ type: 'text', text: block.text });
      }
      // Could add support for thinking/tool_use here if needed
    }

    if (parts.length === 0) return null;

    return {
      id: uuid || generateId(),
      role: 'assistant' as const,
      content: parts,
      createdAt: new Date(),
      status: { type: 'complete' as const, reason: 'stop' },
    };
  }

  return null;
}

export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
  currentSessionId: null,
  messages: [],
  isRunning: false,

  setSessionId: (sessionId) => {
    set({ currentSessionId: sessionId });
  },

  setMessages: (messages) => {
    set({ messages });
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  updateLastMessage: (content) => {
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        const lastIdx = messages.length - 1;
        messages[lastIdx] = {
          ...messages[lastIdx],
          content,
        };
      }
      return { messages };
    });
  },

  setIsRunning: (isRunning) => {
    set({ isRunning });
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  loadHistoricalMessages: (sdkMessages) => {
    const converted: ThreadMessage[] = [];

    for (const sdkMsg of sdkMessages) {
      const msg = convertSDKMessage(sdkMsg);
      if (msg) {
        converted.push(msg);
      }
    }

    console.log('[ChatSessionStore] Loaded', converted.length, 'historical messages from', sdkMessages.length, 'SDK messages');
    set({ messages: converted });
  },
}));

// Export a singleton accessor for the WebSocket adapter
let messagesLoadedCallback: ((messages: SDKMessage[]) => void) | null = null;

export function onMessagesLoaded(callback: (messages: SDKMessage[]) => void): () => void {
  messagesLoadedCallback = callback;
  return () => {
    messagesLoadedCallback = null;
  };
}

export function notifyMessagesLoaded(messages: SDKMessage[]): void {
  if (messagesLoadedCallback) {
    messagesLoadedCallback(messages);
  }
}
