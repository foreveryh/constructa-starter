/**
 * Claude-Style Agent Chat Page
 *
 * A Claude.ai-inspired UI for the Claude Agent SDK.
 * Based on https://www.assistant-ui.com/examples/claude
 */

import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  useMessage,
} from '@assistant-ui/react';
import * as Avatar from '@radix-ui/react-avatar';
import {
  ArrowUpIcon,
  ChevronDownIcon,
  ClipboardIcon,
  Cross2Icon,
  MixerHorizontalIcon,
  Pencil1Icon,
  PlusIcon,
  ReloadIcon,
} from '@radix-ui/react-icons';
import { AuthLoading, RedirectToSignIn, SignedIn } from '@daveyplate/better-auth-ui';
import { createFileRoute } from '@tanstack/react-router';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useState, useCallback, type FC } from 'react';
import { MarkdownText } from '~/components/assistant-ui/markdown-text';
import { SessionList } from '~/components/claude-chat/session-list';
// Use WebSocket adapter for more reliable real-time communication
import {
  ClaudeAgentWSAdapter,
  getSessionId,
  resumeSession,
  newSession,
  onSessionInit,
  checkIsQueryRunning,
  abort,
} from '~/lib/claude-agent-ws-adapter';
import { useChatSessionStore, onMessagesLoaded, type SDKMessage, type ThreadMessage, type TextContentPart } from '~/lib/chat-session-store';

export const Route = createFileRoute('/dashboard/claude-chat')({
  component: RouteComponent,
});

function RouteComponent() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  // Key to force re-mount of chat surface when session changes
  const [chatKey, setChatKey] = useState(0);
  // Pending session switch confirmation
  const [pendingSessionSwitch, setPendingSessionSwitch] = useState<{
    targetSessionId: string | null;
    isNewSession: boolean;
  } | null>(null);

  const { loadHistoricalMessages, clearMessages, setSessionId } = useChatSessionStore();

  // Listen for messages loaded events from WebSocket
  // Note: We do NOT increment chatKey here because that would cause
  // the component to remount, which triggers abort on any running query
  useEffect(() => {
    const unsubscribe = onMessagesLoaded((messages: SDKMessage[]) => {
      console.log('[Route] Received messages_loaded callback with', messages.length, 'messages');
      loadHistoricalMessages(messages);
      // Historical messages are stored in zustand and rendered separately,
      // no need to remount the component
    });

    return unsubscribe;
  }, [loadHistoricalMessages]);

  // Sync with adapter's session ID on mount
  useEffect(() => {
    const sessionId = getSessionId();
    if (sessionId) {
      setCurrentSessionId(sessionId);
      setSessionId(sessionId);
    }
  }, [setSessionId]);

  // Listen for session init events to keep route state in sync with adapter
  useEffect(() => {
    const unsubscribe = onSessionInit((sessionId: string) => {
      console.log('[Route] Session initialized, updating state:', sessionId);
      setCurrentSessionId(sessionId);
      setSessionId(sessionId);
    });
    return unsubscribe;
  }, [setSessionId]);

  // Perform the actual session switch (after confirmation or if no query running)
  const performSessionSwitch = useCallback(async (sdkSessionId: string | null, isNewSession: boolean) => {
    if (isNewSession) {
      console.log('[Route] Starting new session');
      setCurrentSessionId(null);
      setSessionId(null);
      clearMessages();
      newSession();
      setChatKey((k) => k + 1);
    } else if (sdkSessionId) {
      console.log('[Route] Selecting session:', sdkSessionId);
      setCurrentSessionId(sdkSessionId);
      setSessionId(sdkSessionId);
      clearMessages();
      setChatKey((k) => k + 1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await resumeSession(sdkSessionId);
    }
  }, [setSessionId, clearMessages]);

  const handleSelectSession = useCallback(async (sdkSessionId: string) => {
    // Check both route state and adapter state for current session
    // This prevents abort during active query when user clicks on current session
    const adapterSessionId = getSessionId();
    if (sdkSessionId === currentSessionId || sdkSessionId === adapterSessionId) {
      console.log('[Route] Session already active, skipping:', sdkSessionId);
      return;
    }

    // Check if a query is currently running
    if (checkIsQueryRunning()) {
      console.log('[Route] Query running, showing confirmation dialog');
      setPendingSessionSwitch({ targetSessionId: sdkSessionId, isNewSession: false });
      return;
    }

    await performSessionSwitch(sdkSessionId, false);
  }, [currentSessionId, performSessionSwitch]);

  const handleNewSession = useCallback(() => {
    // Check if a query is currently running
    if (checkIsQueryRunning()) {
      console.log('[Route] Query running, showing confirmation dialog for new session');
      setPendingSessionSwitch({ targetSessionId: null, isNewSession: true });
      return;
    }

    performSessionSwitch(null, true);
  }, [performSessionSwitch]);

  // Handle confirmation dialog actions
  const handleConfirmSwitch = useCallback(async () => {
    if (!pendingSessionSwitch) return;

    console.log('[Route] User confirmed session switch, aborting current query');
    // Abort the current query
    await abort();
    // Small delay to allow abort to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Perform the switch
    await performSessionSwitch(pendingSessionSwitch.targetSessionId, pendingSessionSwitch.isNewSession);
    setPendingSessionSwitch(null);
  }, [pendingSessionSwitch, performSessionSwitch]);

  const handleCancelSwitch = useCallback(() => {
    console.log('[Route] User cancelled session switch');
    setPendingSessionSwitch(null);
  }, []);

  return (
    <div className="h-full">
      <AuthLoading>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Checking your session...
        </div>
      </AuthLoading>

      <RedirectToSignIn />

      <SignedIn>
        <div className="flex h-full">
          {/* Left sidebar: Session list */}
          <div className="w-64 shrink-0 border-r border-[#00000015] bg-[#EDEADF] dark:border-[#6c6a6040] dark:bg-[#252420]">
            <SessionList
              currentSessionId={currentSessionId}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
            />
          </div>

          {/* Right: Chat area */}
          <div className="flex-1">
            <ClaudeChatSurface key={chatKey} />
          </div>
        </div>

        {/* Session Switch Blocked Dialog - shown when query is running */}
        {pendingSessionSwitch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-[#2b2a27]">
              <h3 className="mb-3 text-lg font-semibold text-[#1a1a18] dark:text-[#eee]">
                请稍候
              </h3>
              <p className="mb-6 text-[#6b6a68] dark:text-[#9a9893]">
                当前会话正在接收回复，请等待回复完成后再切换会话。
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCancelSwitch}
                  className="rounded-lg bg-[#ae5630] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#c4633a]"
                >
                  知道了
                </button>
              </div>
            </div>
          </div>
        )}
      </SignedIn>
    </div>
  );
}

function ClaudeChatSurface() {
  const runtime = useLocalRuntime(ClaudeAgentWSAdapter);
  const historicalMessages = useChatSessionStore((state) => state.messages);
  const hasHistoricalMessages = historicalMessages.length > 0;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-full flex-col items-stretch bg-[#F5F5F0] p-4 pt-16 font-serif dark:bg-[#2b2a27]">
        <ThreadPrimitive.Viewport className="flex grow flex-col overflow-y-scroll">
          {/* Show empty state only when no historical messages */}
          {!hasHistoricalMessages && (
            <ThreadPrimitive.Empty>
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="text-4xl font-semibold text-[#1a1a18] dark:text-[#eee]">
                  Claude Agent
                </div>
                <p className="max-w-md text-[#6b6a68] dark:text-[#9a9893]">
                  Powered by Claude Agent SDK. I can read files, execute code, and help with various
                  tasks.
                </p>
              </div>
            </ThreadPrimitive.Empty>
          )}

          {/* Render historical messages from store */}
          {historicalMessages.map((msg) => (
            <HistoricalMessage key={msg.id} message={msg} />
          ))}

          {/* Render live messages from runtime */}
          <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
          <div aria-hidden="true" className="h-4" />
        </ThreadPrimitive.Viewport>

        <ComposerPrimitive.Root className="mx-auto flex w-full max-w-3xl flex-col rounded-2xl border border-transparent bg-white p-0.5 shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.035),0_0_0_0.5px_rgba(0,0,0,0.08)] transition-shadow duration-200 focus-within:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.075),0_0_0_0.5px_rgba(0,0,0,0.15)] hover:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.05),0_0_0_0.5px_rgba(0,0,0,0.12)] dark:bg-[#1f1e1b] dark:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(108,106,96,0.15)] dark:hover:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(108,106,96,0.3)] dark:focus-within:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(108,106,96,0.3)]">
          <div className="m-3.5 flex flex-col gap-3.5">
            <div className="relative">
              <div className="wrap-break-word max-h-96 w-full overflow-y-auto">
                <ComposerPrimitive.Input
                  placeholder="How can I help you today?"
                  className="block min-h-6 w-full resize-none bg-transparent text-[#1a1a18] outline-none placeholder:text-[#9a9893] dark:text-[#eee] dark:placeholder:text-[#9a9893]"
                />
              </div>
            </div>
            <div className="flex w-full items-center gap-2">
              <div className="relative flex min-w-0 flex-1 shrink items-center gap-2">
                <ComposerPrimitive.AddAttachment className="flex h-8 min-w-8 items-center justify-center overflow-hidden rounded-lg border border-[#00000015] bg-transparent px-1.5 text-[#6b6a68] transition-all hover:bg-[#f5f5f0] hover:text-[#1a1a18] active:scale-[0.98] dark:border-[#6c6a6040] dark:text-[#9a9893] dark:hover:bg-[#393937] dark:hover:text-[#eee]">
                  <PlusIcon width={16} height={16} />
                </ComposerPrimitive.AddAttachment>
                <button
                  type="button"
                  className="flex h-8 min-w-8 items-center justify-center overflow-hidden rounded-lg border border-[#00000015] bg-transparent px-1.5 text-[#6b6a68] transition-all hover:bg-[#f5f5f0] hover:text-[#1a1a18] active:scale-[0.98] dark:border-[#6c6a6040] dark:text-[#9a9893] dark:hover:bg-[#393937] dark:hover:text-[#eee]"
                  aria-label="Open tools menu"
                >
                  <MixerHorizontalIcon width={16} height={16} />
                </button>
                <button
                  type="button"
                  className="flex h-8 min-w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#00000015] bg-transparent px-1.5 text-[#6b6a68] transition-all hover:bg-[#f5f5f0] hover:text-[#1a1a18] active:scale-[0.98] dark:border-[#6c6a6040] dark:text-[#9a9893] dark:hover:bg-[#393937] dark:hover:text-[#eee]"
                  aria-label="Extended thinking"
                >
                  <ReloadIcon width={16} height={16} />
                </button>
              </div>
              <button
                type="button"
                className="flex h-8 min-w-16 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 pr-2 pl-2.5 text-[#1a1a18] text-xs transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-[#f5f5f0] active:scale-[0.985] dark:text-[#eee] dark:hover:bg-[#393937]"
              >
                <span className="font-serif text-[14px]">GLM 4.6</span>
                <ChevronDownIcon width={20} height={20} className="opacity-75" />
              </button>
              <ComposerPrimitive.Send className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ae5630] transition-colors hover:bg-[#c4633a] active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:bg-[#ae5630] dark:hover:bg-[#c4633a]">
                <ArrowUpIcon width={16} height={16} className="text-white" />
              </ComposerPrimitive.Send>
            </div>
          </div>
          <ComposerAttachmentsSection />
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

const ComposerAttachmentsSection: FC = () => {
  // Note: Attachments display is simplified - the full implementation would require
  // using useComposer() hook to check attachment state
  return (
    <div className="hidden has-[[data-attachments]]:block overflow-hidden rounded-b-2xl">
      <div className="overflow-x-auto rounded-b-2xl border-[#00000015] border-t bg-[#f5f5f0] p-3.5 dark:border-[#6c6a6040] dark:bg-[#393937]">
        <div className="flex flex-row gap-3" data-attachments>
          <ComposerPrimitive.Attachments components={{ Attachment: ClaudeAttachment }} />
        </div>
      </div>
    </div>
  );
};

const ChatMessage: FC = () => {
  const message = useMessage();
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isLast = message.isLast;

  if (isUser) {
    return (
      <MessagePrimitive.Root className="group relative mx-auto mt-1 mb-1 block w-full max-w-3xl">
        <div className="group/user wrap-break-word relative inline-flex max-w-[75ch] flex-col gap-2 rounded-xl bg-[#DDD9CE] py-2.5 pr-6 pl-2.5 text-[#1a1a18] transition-all dark:bg-[#393937] dark:text-[#eee]">
          <div className="relative flex flex-row gap-2">
            <div className="shrink-0 self-start transition-all duration-300">
              <Avatar.Root className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-[#1a1a18] font-bold text-[12px] text-white dark:bg-[#eee] dark:text-[#2b2a27]">
                <Avatar.AvatarFallback>U</Avatar.AvatarFallback>
              </Avatar.Root>
            </div>
            <div className="flex-1">
              <div className="relative grid grid-cols-1 gap-2 py-0.5">
                <div className="wrap-break-word whitespace-pre-wrap">
                  <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
                </div>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute right-2 bottom-0">
            <ActionBarPrimitive.Root
              autohide="not-last"
              className="pointer-events-auto min-w-max translate-x-1 translate-y-4 rounded-lg border-[#00000015] border-[0.5px] bg-white/80 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition group-hover/user:translate-x-0.5 group-hover/user:opacity-100 dark:border-[#6c6a6040] dark:bg-[#1f1e1b]/80"
            >
              <div className="flex items-center text-[#6b6a68] dark:text-[#9a9893]">
                <ActionBarPrimitive.Reload className="flex h-8 w-8 items-center justify-center rounded-md transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-transparent active:scale-95">
                  <ReloadIcon width={20} height={20} />
                </ActionBarPrimitive.Reload>
                <ActionBarPrimitive.Edit className="flex h-8 w-8 items-center justify-center rounded-md transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-transparent active:scale-95">
                  <Pencil1Icon width={20} height={20} />
                </ActionBarPrimitive.Edit>
              </div>
            </ActionBarPrimitive.Root>
          </div>
        </div>
      </MessagePrimitive.Root>
    );
  }

  if (isAssistant) {
    return (
      <MessagePrimitive.Root className="group relative mx-auto mt-1 mb-1 block w-full max-w-3xl">
        <div className="relative mb-12 font-serif">
          <div className="relative leading-[1.65rem]">
            <div className="grid grid-cols-1 gap-2.5">
              <div className="wrap-break-word whitespace-normal pr-8 pl-2 font-serif text-[#1a1a18] dark:text-[#eee]">
                <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0">
            <ActionBarPrimitive.Root
              hideWhenRunning
              autohide="not-last"
              className="pointer-events-auto flex w-full translate-y-full flex-col items-end px-2 pt-2 transition"
            >
              <div className="flex items-center text-[#6b6a68] dark:text-[#9a9893]">
                <ActionBarPrimitive.Copy className="flex h-8 w-8 items-center justify-center rounded-md transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-transparent active:scale-95">
                  <ClipboardIcon width={20} height={20} />
                </ActionBarPrimitive.Copy>
                <ActionBarPrimitive.FeedbackPositive className="flex h-8 w-8 items-center justify-center rounded-md transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-transparent active:scale-95">
                  <ThumbsUp width={16} height={16} />
                </ActionBarPrimitive.FeedbackPositive>
                <ActionBarPrimitive.FeedbackNegative className="flex h-8 w-8 items-center justify-center rounded-md transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-transparent active:scale-95">
                  <ThumbsDown width={16} height={16} />
                </ActionBarPrimitive.FeedbackNegative>
                <ActionBarPrimitive.Reload className="flex h-8 w-8 items-center justify-center rounded-md transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-transparent active:scale-95">
                  <ReloadIcon width={20} height={20} />
                </ActionBarPrimitive.Reload>
              </div>
              {isLast && (
                <p className="mt-2 w-full text-right text-[#8a8985] text-[0.65rem] leading-[0.85rem] opacity-90 sm:text-[0.75rem] dark:text-[#b8b5a9]">
                  Claude can make mistakes. Please double-check responses.
                </p>
              )}
            </ActionBarPrimitive.Root>
          </div>
        </div>
      </MessagePrimitive.Root>
    );
  }

  return null;
};

/**
 * Historical Message Component
 * Renders messages loaded from JSONL history files
 */
const HistoricalMessage: FC<{ message: ThreadMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Get text content
  const textContent = message.content
    .filter((p): p is TextContentPart => p.type === 'text')
    .map((p) => p.text)
    .join('\n');

  if (isUser) {
    return (
      <div className="group relative mx-auto mt-1 mb-1 block w-full max-w-3xl">
        <div className="group/user wrap-break-word relative inline-flex max-w-[75ch] flex-col gap-2 rounded-xl bg-[#DDD9CE] py-2.5 pr-6 pl-2.5 text-[#1a1a18] transition-all dark:bg-[#393937] dark:text-[#eee]">
          <div className="relative flex flex-row gap-2">
            <div className="shrink-0 self-start transition-all duration-300">
              <Avatar.Root className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-[#1a1a18] font-bold text-[12px] text-white dark:bg-[#eee] dark:text-[#2b2a27]">
                <Avatar.AvatarFallback>U</Avatar.AvatarFallback>
              </Avatar.Root>
            </div>
            <div className="flex-1">
              <div className="relative grid grid-cols-1 gap-2 py-0.5">
                <div className="wrap-break-word whitespace-pre-wrap">
                  {textContent}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAssistant) {
    return (
      <div className="group relative mx-auto mt-1 mb-1 block w-full max-w-3xl">
        <div className="relative mb-12 font-serif">
          <div className="relative leading-[1.65rem]">
            <div className="grid grid-cols-1 gap-2.5">
              <div className="wrap-break-word whitespace-normal pr-8 pl-2 font-serif text-[#1a1a18] dark:text-[#eee]">
                {textContent}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const ClaudeAttachment: FC = () => {
  return (
    <AttachmentPrimitive.Root className="group/thumbnail relative">
      <div
        className="can-focus-within overflow-hidden rounded-lg border border-[#00000020] shadow-sm hover:border-[#00000040] hover:shadow-md dark:border-[#6c6a6040] dark:hover:border-[#6c6a6080]"
        style={{
          width: '120px',
          height: '120px',
          minWidth: '120px',
          minHeight: '120px',
        }}
      >
        <button
          type="button"
          className="relative flex h-full w-full items-center justify-center bg-white text-[#6b6a68] dark:bg-[#2b2a27] dark:text-[#9a9893]"
        >
          <AttachmentPrimitive.unstable_Thumb className="text-xs" />
        </button>
      </div>
      <AttachmentPrimitive.Remove
        className="-left-2 -top-2 absolute flex h-5 w-5 items-center justify-center rounded-full border border-[#00000020] bg-white/90 text-[#6b6a68] opacity-0 backdrop-blur-sm transition-all hover:bg-white hover:text-[#1a1a18] group-focus-within/thumbnail:opacity-100 group-hover/thumbnail:opacity-100 dark:border-[#6c6a6040] dark:bg-[#1f1e1b]/90 dark:text-[#9a9893] dark:hover:bg-[#1f1e1b] dark:hover:text-[#eee]"
        aria-label="Remove attachment"
      >
        <Cross2Icon width={12} height={12} />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
};
