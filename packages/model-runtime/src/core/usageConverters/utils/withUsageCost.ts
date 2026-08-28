import type { ModelUsage } from '@lobechat/types';
import type { Pricing } from 'model-bank';

import type { ComputeChatCostOptions } from './computeChatCost';
import { computeChatCost } from './computeChatCost';

export const withUsageCost = (
  usage: ModelUsage & { cost?: number; cost_details?: unknown },
  pricing?: Pricing,
  options?: ComputeChatCostOptions,
): ModelUsage => {
  if (!pricing) {
    // OpenRouter returns native usage.cost – preserve it when local pricing is missing (BYOK / new models)
    if (typeof (usage as any).cost === 'number') return usage as ModelUsage;
    return usage;
  }

  const pricingResult = computeChatCost(pricing, usage, options);
  if (!pricingResult) return usage;

  return { ...usage, cost: pricingResult.totalCost };
};
