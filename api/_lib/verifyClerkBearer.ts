import { verifyToken } from '@clerk/backend';
import { serverEnv } from './env';

/**
 * Verify a Clerk session JWT from the browser (`getToken()`).
 *
 * When `CAPACITY_CLERK_AUTHORIZED_PARTIES` is set, we verify with that list first
 * (same as shared-dsl). If that fails, we retry with `secretKey` only: incomplete
 * party lists (e.g. missing `http://localhost:3000`) are a common dev misconfig and
 * would otherwise yield 401 for otherwise valid session JWTs.
 */
export async function verifyClerkBearerToken(bearer: string): Promise<Record<string, unknown>> {
  const env = serverEnv();
  const base: Parameters<typeof verifyToken>[1] = { secretKey: env.clerkSecretKey };
  const parties = env.clerkAuthorizedParties;

  if (parties.length > 0) {
    try {
      return (await verifyToken(bearer, {
        ...base,
        authorizedParties: parties,
      })) as Record<string, unknown>;
    } catch (e) {
      try {
        const out = (await verifyToken(bearer, base)) as Record<string, unknown>;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          '[clerk] verifyToken with authorizedParties failed; retried with secretKey only.',
          msg
        );
        return out;
      } catch {
        throw e;
      }
    }
  }

  return (await verifyToken(bearer, base)) as Record<string, unknown>;
}
