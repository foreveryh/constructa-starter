/**
 * Agent Chat Page
 *
 * Uses Claude Agent SDK via ClaudeAgentAdapter for Assistant UI.
 * This is a separate implementation from the Mastra-based /dashboard/chat.
 */

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  useAssistantState,
} from '@assistant-ui/react';
import { AuthLoading, RedirectToSignIn, SignedIn } from '@daveyplate/better-auth-ui';
import { createFileRoute } from '@tanstack/react-router';
import { Bot, Loader2, Send, Terminal, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { ScopedAssistantStyles } from '~/components/chat-assistant-styles';
// Use WebSocket adapter for more reliable real-time communication
import { ClaudeAgentWSAdapter } from '~/lib/claude-agent-ws-adapter';

export const Route = createFileRoute('/dashboard/agent-chat')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="container mx-auto h-full px-4">
      <div className="flex h-full flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Chat</h1>
          <p className="text-muted-foreground">
            Chat with Claude Agent SDK - can execute tools and run code.
          </p>
        </div>

        <Card className="flex flex-1 flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Claude Agent
            </CardTitle>
            <CardDescription>
              Powered by Claude Agent SDK. Supports tool execution, file operations, and more.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <AuthLoading>
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Checking your session...
              </div>
            </AuthLoading>

            <RedirectToSignIn />

            <SignedIn>
              <AgentChatSurface />
            </SignedIn>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AgentChatSurface() {
  const runtime = useLocalRuntime(ClaudeAgentWSAdapter);
  const scopeClass = 'agent-chat-theme';

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ScopedAssistantStyles scopeClass={scopeClass} />
      <div className={cn('flex flex-1 flex-col gap-4 aui-root', scopeClass)}>
        <ThreadPrimitive.Root className="flex flex-1 flex-col">
          <ThreadPrimitive.Viewport
            autoScroll
            className="flex-1 space-y-4 overflow-y-auto pr-1"
          >
            <ThreadPrimitive.Empty>
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <Bot className="h-8 w-8 text-muted-foreground/50" />
                <p>Ask the Claude Agent to help with tasks.</p>
                <p className="text-xs">
                  The agent can read files, execute code, and perform various operations.
                </p>
              </div>
            </ThreadPrimitive.Empty>

            <ThreadPrimitive.Messages components={{ Message: AgentChatMessage }} />
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>

        <ComposerPrimitive.Root className="flex items-end gap-2 rounded-lg border bg-background p-3 shadow-sm">
          <ComposerPrimitive.Input
            placeholder="Ask the agent something..."
            className="max-h-40 flex-1 resize-none bg-transparent text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />
          <ComposerPrimitive.Send
            className={cn(buttonVariants({ variant: 'default', size: 'icon' }))}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}

function AgentChatMessage() {
  const role = useAssistantState((state) => state.message.role);
  const isRunning = useAssistantState((state) => state.message.status?.type === 'running');

  return (
    <MessagePrimitive.Root
      className={cn(
        'max-w-[75%] rounded-lg px-4 py-2 text-sm shadow-sm ring-1 ring-transparent transition-colors',
        role === 'user'
          ? 'ml-auto bg-primary text-primary-foreground'
          : 'mr-auto bg-muted text-foreground'
      )}
    >
      <MessagePrimitive.Content />
      {isRunning && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Processing...</span>
        </div>
      )}
    </MessagePrimitive.Root>
  );
}
