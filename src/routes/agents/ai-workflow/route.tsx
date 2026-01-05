/**
 * AI SDK Workflow Page
 *
 * Using @ai-sdk/react with AI Elements components.
 * This is a placeholder - workflows need to be defined in Mastra first.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useChat } from '@ai-sdk/react';
import { Message, MessageContent } from '~/components/ai-elements/message';
import { Response } from '~/components/ai-elements/response';
import { Tool, ToolHeader, ToolContent, ToolOutput } from '~/components/ai-elements/tool';
import { Loader } from '~/components/ai-elements/loader';
import { AuthLoading, RedirectToSignIn, SignedIn } from '@daveyplate/better-auth-ui';
import { Workflow, Bot } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { useState, Fragment } from 'react';

export const Route = createFileRoute('/agents/ai-workflow')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="container mx-auto h-full px-4">
      <div className="flex h-full flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Workflow</h1>
          <p className="text-muted-foreground">
            Execute Mastra workflows using @ai-sdk/react and AI Elements.
          </p>
        </div>

        <Card className="flex flex-1 flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              AI SDK Workflow
            </CardTitle>
            <CardDescription>
              Workflow execution with step-by-step progress tracking.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <AuthLoading>
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Checking your session…
              </div>
            </AuthLoading>

            <RedirectToSignIn />

            <SignedIn>
              <AIWorkflowSurface />
            </SignedIn>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AIWorkflowSurface() {
  const [input, setInput] = useState('');
  const [workflowId, setWorkflowId] = useState('example-workflow');

  // Note: This will fail until a workflow is created in Mastra
  // The API endpoint should be: /api/workflow/{workflowId}
  const { messages, sendMessage, status } = useChat({
    api: `/api/workflow/${workflowId}`,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || !input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Workflow selector */}
      <div className="flex items-center gap-4 rounded-lg border p-4">
        <label htmlFor="workflow-select" className="text-sm font-medium">
          Workflow:
        </label>
        <select
          id="workflow-select"
          value={workflowId}
          onChange={(e) => setWorkflowId(e.target.value)}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="example-workflow">Example Workflow (Not implemented)</option>
        </select>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter workflow input..."
          disabled={status !== 'ready'}
        />
        <Button
          type="submit"
          disabled={status !== 'ready' || !input || !input.trim()}
        >
          Run Workflow
        </Button>
      </form>

      {/* Messages and workflow steps */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {messages.map((message) => (
          <div key={message.id}>
            {message.parts.map((part, index) => {
              // User message
              if (part.type === 'text' && message.role === 'user') {
                return (
                  <Message key={index} from={message.role}>
                    <MessageContent>
                      <Response>{part.text}</Response>
                    </MessageContent>
                  </Message>
                );
              }

              // Workflow data
              if (part.type === 'data-workflow') {
                const workflowData = part.data as {
                  name: string;
                  steps: Record<string, { status: string; output: unknown }>;
                };

                return (
                  <Fragment key={index}>
                    {Object.entries(workflowData.steps).map(([stepKey, step]: [string, any]) => (
                      <Tool key={stepKey}>
                        <ToolHeader
                          title={step.name || stepKey}
                          type="tool-workflow"
                          state={
                            step.status === 'success'
                              ? 'output-available'
                              : step.status === 'failed'
                              ? 'output-error'
                              : 'input-available'
                          }
                        />
                        <ToolContent>
                          <ToolOutput output={step.output} />
                        </ToolContent>
                      </Tool>
                    ))}
                  </Fragment>
                );
              }

              return null;
            })}
          </div>
        ))}
      </div>

      {status === 'submitted' && <Loader />}

      {/* Placeholder message */}
      {messages.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-center text-muted-foreground">
          <div className="space-y-2">
            <Bot className="mx-auto h-12 w-12" />
            <p className="text-sm">Workflows need to be defined in Mastra first.</p>
            <p className="text-xs">
              Check the Mastra documentation for workflow configuration.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
