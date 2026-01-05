/**
 * AI SDK Chat Page
 *
 * Simplified implementation based on UI-DOJO, adapted for TanStack Start
 */

import { createFileRoute } from '@tanstack/react-router';
import { AISdkChat } from '~/components/ai-sdk-chat';

export const Route = createFileRoute('/agents/ai-chat')({
  component: AIChatPage,
});

function AIChatPage() {
  return (
    <div className="h-full">
      <AISdkChat />
    </div>
  );
}
