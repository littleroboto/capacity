/**
 * Vercel entry for `GET|HEAD|PUT /api/shared-dsl`.
 * Loads `api/lib/sharedDslRoute.ts` on demand so a bad dependency graph surfaces as JSON
 * (`shared_dsl_module_failed`) instead of an opaque FUNCTION_INVOCATION_FAILED when the import fails.
 *
 * Full env matrix and YAML/Blob behaviour: see `api/lib/sharedDslRoute.ts`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const { handleSharedDsl } = await import('./lib/sharedDslRoute');
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
