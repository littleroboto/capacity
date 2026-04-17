import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServiceClient } from '../lib/supabaseClient';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const client = supabaseServiceClient();
    const { count, error } = await client
      .from('markets')
      .select('*', { count: 'exact', head: true });

    if (error) {
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    res.status(200).json({ ok: true, marketCount: count ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: msg });
  }
}
