/**
 * Vercel entry for `GET|HEAD|PUT /api/shared-dsl`.
 *
 * `handleSharedDsl` is imported statically so @vercel/node’s bundler traces `api/lib/**` into
 * this function. A dynamic `import('./lib/sharedDslRoute')` is not traced: production only had
 * `shared-dsl.js`, while `includeFiles` shipped raw `.ts` sources — Node cannot load those, so
 * requests failed with ERR_MODULE_NOT_FOUND for `/var/task/api/lib/sharedDslRoute`.
 *
 * Full env matrix and YAML/Blob behaviour: see `api/lib/sharedDslRoute.ts`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSharedDsl } from './lib/sharedDslRoute';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    await handleSharedDsl(req, res);
  } catch (e) {
    console.error('[shared-dsl] entry', e);
    if (res.headersSent) return;
    const errMsg = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      error: 'shared_dsl_module_failed',
      message: errMsg,
      hint:
        'The shared-dsl handler module failed to load or threw before sending a response. Check Vercel function logs for [shared-dsl] entry.',
    });
  }
}
