/**
 * Approximate USD per 1M tokens (input / output). Update when OpenAI pricing changes.
 * Display only — disclaimer shown in UI.
 */
export const OPENAI_MODEL_PRICING_USD_PER_1M: Record<
  string,
  { input: number; output: number; label: string }
> = {
  'gpt-4o': { input: 2.5, output: 10, label: 'GPT-4o' },
  'gpt-4o-mini': { input: 0.15, output: 0.6, label: 'GPT-4o mini' },
  'gpt-4.1': { input: 2, output: 8, label: 'GPT-4.1' },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, label: 'GPT-4.1 mini' },
  'o4-mini': { input: 1.1, output: 4.4, label: 'o4-mini' },
};

export const DEFAULT_OPENAI_MODEL_ID = 'gpt-4o-mini';

/** Curated order for the model dropdown (all must exist in {@link OPENAI_MODEL_PRICING_USD_PER_1M}). */
export const OPENAI_MODEL_IDS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.1-mini',
  'o4-mini',
] as const satisfies readonly string[];

export function estimateMessageCostUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const row = OPENAI_MODEL_PRICING_USD_PER_1M[modelId] ?? OPENAI_MODEL_PRICING_USD_PER_1M['gpt-4o']!;
  return (promptTokens * row.input + completionTokens * row.output) / 1_000_000;
}
