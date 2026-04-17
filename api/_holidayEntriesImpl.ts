import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateScope } from './lib/authScope';
import { scopeAllowsMarketEdit } from './lib/scopeResolver';
import { supabaseServiceClient } from './lib/supabaseClient';
import type { OperatingModelId } from './lib/domainTypes';

function bearerFromHeader(h: string | string[] | undefined): string | undefined {
  if (!h) return undefined;
  const v = Array.isArray(h) ? h[0] : h;
  return /^Bearer\s+(.+)$/i.exec(v?.trim() ?? '')?.[1]?.trim();
}

async function lookupMarketMeta(marketId: string) {
  const client = supabaseServiceClient();
  const { data } = await client.from('markets').select('segment_id, operating_model_id').eq('id', marketId).single();
  return data as { segment_id: string; operating_model_id: string } | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const bearer = bearerFromHeader(req.headers.authorization);
  if (!bearer) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const auth = await authenticateScope(bearer, res);
  if (!auth.ok) return;

  const method = req.method?.toUpperCase();
  const client = supabaseServiceClient();

  if (method === 'POST') {
    let body: Record<string, unknown> = {};
    if (req.body == null || req.body === '') {
      body = {};
    } else if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body) as Record<string, unknown>;
      } catch {
        res.status(400).json({ error: 'invalid JSON body' });
        return;
      }
    } else {
      body = req.body as Record<string, unknown>;
    }
    const calendarId = body.calendar_id as string | undefined;
    const holidayDate = (body.holiday_date as string | undefined)?.trim();
    const label = typeof body.label === 'string' ? body.label.trim() || undefined : undefined;
    if (!calendarId || !holidayDate) {
      res.status(400).json({ error: 'calendar_id and holiday_date required' });
      return;
    }
    const { data: cal, error: calErr } = await client
      .from('holiday_calendars')
      .select('id, market_id, operating_model_id, segment_id')
      .eq('id', calendarId)
      .single();
    if (calErr || !cal) {
      res.status(404).json({ error: 'calendar not found' });
      return;
    }
    const mkt = await lookupMarketMeta(cal.market_id);
    if (
      !mkt ||
      !scopeAllowsMarketEdit(
        auth.scope,
        cal.market_id,
        mkt.segment_id,
        mkt.operating_model_id as OperatingModelId
      )
    ) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const { data: row, error } = await client
      .from('holiday_entries')
      .insert({
        calendar_id: calendarId,
        holiday_date: holidayDate,
        label: label ?? null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: 'That date is already on this calendar' });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json(row);
    return;
  }

  if (method === 'DELETE') {
    const id = req.query.id as string;
    if (!id) {
      res.status(400).json({ error: 'id query param required' });
      return;
    }
    const { data: entry, error: e1 } = await client
      .from('holiday_entries')
      .select('id, calendar_id')
      .eq('id', id)
      .single();
    if (e1 || !entry) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const { data: cal } = await client
      .from('holiday_calendars')
      .select('market_id, operating_model_id, segment_id')
      .eq('id', entry.calendar_id)
      .single();
    if (!cal) {
      res.status(404).json({ error: 'calendar not found' });
      return;
    }
    const mkt = await lookupMarketMeta(cal.market_id);
    if (
      !mkt ||
      !scopeAllowsMarketEdit(
        auth.scope,
        cal.market_id,
        mkt.segment_id,
        mkt.operating_model_id as OperatingModelId
      )
    ) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const { error } = await client.from('holiday_entries').delete().eq('id', id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader('Allow', 'POST, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
