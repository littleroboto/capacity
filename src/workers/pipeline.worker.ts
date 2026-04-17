import { runPipelineFromDsl } from '@/engine/pipeline';
import type { RiskModelTuning } from '@/engine/riskModelTuning';

export type PipelineWorkerInbound = {
  dsl: string;
  tuning: RiskModelTuning;
};

self.onmessage = (e: MessageEvent<PipelineWorkerInbound>) => {
  const { dsl, tuning } = e.data;
  try {
    const r = runPipelineFromDsl(dsl, tuning);
    postMessage({
      ok: true as const,
      riskSurface: r.riskSurface,
      configs: r.configs,
      parseError: r.parseError ?? null,
    });
  } catch (err) {
    postMessage({
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
