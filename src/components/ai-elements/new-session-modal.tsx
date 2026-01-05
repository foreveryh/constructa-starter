'use client';

/**
 * New Session Modal Component
 *
 * Modal dialog for creating a new chat session with agent selection.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { cn } from '~/lib/utils';

// Available agents configuration
const AGENTS = [
  {
    id: 'assistant-agent',
    name: '通用助手',
    icon: '💬',
    description: 'AI 助手，可以回答问题、帮助分析',
  },
  {
    id: 'translator-agent',
    name: '语言炼金师',
    icon: '🎭',
    description: '追求翻译的最高境界，灵魂的重生',
  },
];

interface NewSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateSession: (agentId: string, title?: string) => void;
}

export function NewSessionModal({
  open,
  onOpenChange,
  onCreateSession,
}: NewSessionModalProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('assistant-agent');
  const [title, setTitle] = useState('');

  const handleCreate = () => {
    onCreateSession(selectedAgent, title || undefined);
    // Reset form
    setTitle('');
    setSelectedAgent('assistant-agent');
    onOpenChange(false);
  };

  const handleAgentSelect = (agentId: string) => {
    setSelectedAgent(agentId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建新会话</DialogTitle>
          <DialogDescription>
            选择一个 Agent 开始新的对话
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Agent Selection */}
          <div className="space-y-2">
            <Label>选择 Agent</Label>
            <div className="grid grid-cols-2 gap-2">
              {AGENTS.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleAgentSelect(agent.id)}
                  className={cn(
                    'flex flex-col items-start p-3 rounded-lg border-2 transition-colors',
                    'hover:bg-accent/50',
                    selectedAgent === agent.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  )}
                >
                  <span className="text-2xl mb-1">{agent.icon}</span>
                  <span className="text-sm font-medium text-left">
                    {agent.name}
                  </span>
                  <span className="text-xs text-muted-foreground text-left mt-0.5">
                    {agent.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Title */}
          <div className="space-y-2">
            <Label htmlFor="title">会话标题（可选）</Label>
            <Input
              id="title"
              placeholder="留空则自动生成"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleCreate}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
