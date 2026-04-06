import type * as Party from 'partykit/server';
import { verifyToken } from '@clerk/backend';
import { onConnect } from 'y-partykit';
import { isClerkJwtEmailAllowed, parseAllowedEmailSet } from '../api/allowedUserEmails';
import { parseCollabRoomId } from './collabRoomId';
import {
  extractOrgRoleNormFromVerifiedJwt,
  isKnownManifestMarket,
  parseCapacityAccessServer,
  parseOrgAdminRolesFromEnv,
} from './parseCapacityAccessServer';

const allowedUserEmails = parseAllowedEmailSet(process.env.CAPACITY_ALLOWED_USER_EMAILS);

function authorizedParties(): string[] | undefined {
  const raw = process.env.CAPACITY_CLERK_AUTHORIZED_PARTIES?.trim();
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

export default class Collab implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get('token')?.trim() ?? '';
    const clerkSecret = process.env.CLERK_SECRET_KEY?.trim();

    if (!clerkSecret) {
      console.error('[collab] CLERK_SECRET_KEY is not set — rejecting connection');
      conn.close(4401, 'server_misconfigured');
      return;
    }

    if (!token) {
      conn.close(4401, 'missing_token');
      return;
    }

    let payload: Record<string, unknown>;
    try {
      const opts: Parameters<typeof verifyToken>[1] = { secretKey: clerkSecret };
      const parties = authorizedParties();
      if (parties?.length) opts.authorizedParties = parties;
      payload = (await verifyToken(token, opts)) as Record<string, unknown>;
    } catch {
      conn.close(4401, 'invalid_token');
      return;
    }

    if (!isClerkJwtEmailAllowed(payload, allowedUserEmails)) {
      conn.close(4403, 'email_not_allowed');
      return;
    }

    const orgRoleNorm = extractOrgRoleNormFromVerifiedJwt(payload);
    const orgAdminRoles = parseOrgAdminRolesFromEnv(process.env.CAPACITY_ORG_ADMIN_ROLES);
    const access = parseCapacityAccessServer(payload, orgRoleNorm, orgAdminRoles);

    if (!access.canEditYaml && !access.admin) {
      conn.close(4403, 'read_only');
      return;
    }

    const parsed = parseCollabRoomId(this.room.id);
    if (!parsed) {
      conn.close(4400, 'bad_room');
      return;
    }

    const marketId = parsed.marketId.trim().toUpperCase();
    if (!isKnownManifestMarket(marketId)) {
      conn.close(4400, 'unknown_market');
      return;
    }

    if (!access.legacyFullAccess && !access.admin && !access.allowedMarketIds.has(marketId)) {
      conn.close(4403, 'market_forbidden');
      return;
    }

    await onConnect(conn, this.room, {
      persist: { mode: 'snapshot' },
    });
  }
}
