import { runPipelineFromDsl, type PipelineResult } from '@/engine/pipeline';
import type { RiskModelTuning } from '@/engine/riskModelTuning';

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/pipeline.worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

/**
 * Runs {@link runPipelineFromDsl} off the main thread when workers are available.
 * Falls back to synchronous pipeline on failure (worker init, postMessage, etc.).
 */
export async function runPipelineInWorker(
  dsl: string,
  tuning: RiskModelTuning
): Promise<PipelineResult> {
  try {
    const w = getWorker();
    const result = await new Promise<PipelineResult>((resolve, reject) => {
      const onMessage = (ev: MessageEvent) => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
        const d = ev.data as
          | { ok: true; riskSurface: PipelineResult['riskSurface']; configs: PipelineResult['configs']; parseError: string | null }
          | { ok: false; error: string };
        if (d.ok) {
          resolve({
            riskSurface: d.riskSurface,
            configs: d.configs,
            parseError: d.parseError ?? undefined,
          });
        } else {
          reject(new Error(d.error));
        }
      };
      const onError = () => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
        reject(new Error('pipeline worker error'));
      };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      w.postMessage({ dsl, tuning });
    });
    return result;
  } catch {
    return runPipelineFromDsl(dsl, tuning);
  }
}
