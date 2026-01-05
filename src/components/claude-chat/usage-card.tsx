/**
 * Usage/Cost Statistics Card
 *
 * Displays token usage, cost, and conversation statistics
 * in a floating card triggered by the action bar button.
 */

import { type FC } from 'react';
import { Cross2Icon } from '@radix-ui/react-icons';

export interface UsageData {
  // Total token usage
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };

  // Cost information
  total_cost_usd?: number;

  // Conversation metadata
  num_turns?: number;
  duration_ms?: number;

  // Model-specific usage (optional, for expand details)
  modelUsage?: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    costUSD: number;
  }>;
}

interface UsageCardProps {
  data: UsageData;
  onClose: () => void;
}

export const UsageCard: FC<UsageCardProps> = ({ data, onClose }) => {
  const { usage, total_cost_usd, num_turns, duration_ms, modelUsage } = data;

  // Calculate total tokens
  const totalTokens = usage
    ? usage.input_tokens + usage.output_tokens
    : 0;

  // Format duration
  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  };

  // Format number with commas
  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return 'N/A';
    return num.toLocaleString();
  };

  // Format cost
  const formatCost = (cost?: number) => {
    if (cost === undefined || cost === null) return 'N/A';
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-[#e5e4df] bg-white p-4 shadow-lg dark:border-[#3a3938] dark:bg-[#1f1e1b]">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-[#1a1a18] text-sm dark:text-[#eee]">
          📊 本次对话统计
        </h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-[#6b6a68] transition hover:bg-[#e5e4df] dark:text-[#9a9893] dark:hover:bg-[#3a3938]"
          aria-label="关闭"
        >
          <Cross2Icon width={14} height={14} />
        </button>
      </div>

      <div className="space-y-3">
        {/* Conversation Info */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6b6a68] dark:text-[#9a9893]">💬 对话轮数</span>
            <span className="font-medium text-[#1a1a18] dark:text-[#eee]">
              {formatNumber(num_turns)} 轮
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6b6a68] dark:text-[#9a9893]">⏱️ 总时长</span>
            <span className="font-medium text-[#1a1a18] dark:text-[#eee]">
              {formatDuration(duration_ms)}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#e5e4df] dark:border-[#3a3938]" />

        {/* Token Usage */}
        <div>
          <div className="mb-1.5 font-medium text-[#1a1a18] text-xs dark:text-[#eee]">
            Token 使用
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#6b6a68] dark:text-[#9a9893]">🔢 总计</span>
              <span className="font-medium text-[#1a1a18] dark:text-[#eee]">
                {formatNumber(totalTokens)} tokens
              </span>
            </div>
            {usage && (
              <>
                <div className="flex items-center justify-between pl-4 text-xs">
                  <span className="text-[#8a8985] dark:text-[#b8b5a9]">• 输入</span>
                  <span className="text-[#6b6a68] dark:text-[#9a9893]">
                    {formatNumber(usage.input_tokens)}
                  </span>
                </div>
                <div className="flex items-center justify-between pl-4 text-xs">
                  <span className="text-[#8a8985] dark:text-[#b8b5a9]">• 输出</span>
                  <span className="text-[#6b6a68] dark:text-[#9a9893]">
                    {formatNumber(usage.output_tokens)}
                  </span>
                </div>
              </>
            )}
            {usage?.cache_read_input_tokens && usage.cache_read_input_tokens > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#6b6a68] dark:text-[#9a9893]">💾 缓存命中</span>
                <span className="font-medium text-[#1a1a18] dark:text-[#eee]">
                  {formatNumber(usage.cache_read_input_tokens)} tokens
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#e5e4df] dark:border-[#3a3938]" />

        {/* Cost */}
        <div>
          <div className="mb-1.5 font-medium text-[#1a1a18] text-xs dark:text-[#eee]">
            成本
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6b6a68] dark:text-[#9a9893]">💰 总计</span>
            <span className="font-semibold text-[#ae5630] text-sm dark:text-[#d4825e]">
              {formatCost(total_cost_usd)}
            </span>
          </div>
        </div>

        {/* Model Usage (Expandable - Optional Enhancement) */}
        {modelUsage && Object.keys(modelUsage).length > 0 && (
          <>
            <details className="group">
              <summary className="cursor-pointer text-[#6b6a68] text-xs hover:text-[#1a1a18] dark:text-[#9a9893] dark:hover:text-[#eee]">
                <span className="inline-block transition group-open:rotate-90">▶</span> 按模型分类
              </summary>
              <div className="mt-2 space-y-2 pl-2">
                {Object.entries(modelUsage).map(([model, stats]) => (
                  <div key={model} className="space-y-1 rounded bg-[#f5f4f0] p-2 dark:bg-[#2b2a27]">
                    <div className="font-medium text-[#1a1a18] text-xs dark:text-[#eee]">
                      {model.replace('claude-', '')}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8a8985] dark:text-[#b8b5a9]">Tokens</span>
                      <span className="text-[#6b6a68] dark:text-[#9a9893]">
                        {formatNumber(stats.inputTokens + stats.outputTokens)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8a8985] dark:text-[#b8b5a9]">成本</span>
                      <span className="text-[#6b6a68] dark:text-[#9a9893]">
                        {formatCost(stats.costUSD)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>

      {/* Footer Note */}
      <div className="mt-3 pt-3 border-t border-[#e5e4df] text-[#8a8985] text-[10px] dark:border-[#3a3938] dark:text-[#b8b5a9]">
        统计数据仅供参考，实际账单以 Anthropic 官方为准
      </div>
    </div>
  );
};
