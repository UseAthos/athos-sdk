export type GateEnv = {
  DOCS_PASSWORDS?: string;
  DOCS_AUTH_SECRET?: string;
  NODE_ENV?: string;
};

/** Org name → that org's shared password. */
export type OrgPasswords = Record<string, string>;

export type Gate =
  | { mode: 'on'; orgs: OrgPasswords; secret: string }
  | { mode: 'off' }
  | { mode: 'misconfigured'; reason: string };

// HS256 keys should be at least 256 bits; 32 characters is the floor we accept.
export const MIN_SECRET_LENGTH = 32;

// The gate is on whenever DOCS_PASSWORDS is set. With no passwords, local
// development runs open, but production fails closed rather than serving the
// site to everyone. Anything malformed also fails closed, with a reason for
// the server log.
export function resolveGate(env: GateEnv = process.env): Gate {
  const raw = env.DOCS_PASSWORDS;
  const secret = env.DOCS_AUTH_SECRET;

  if (!raw) {
    if (env.NODE_ENV !== 'production') return { mode: 'off' };
    return { mode: 'misconfigured', reason: 'DOCS_PASSWORDS is not set' };
  }

  const parsed = parseOrgPasswords(raw);
  if ('error' in parsed) return { mode: 'misconfigured', reason: `DOCS_PASSWORDS ${parsed.error}` };

  if (!secret) return { mode: 'misconfigured', reason: 'DOCS_AUTH_SECRET is not set' };
  if (secret.length < MIN_SECRET_LENGTH) {
    return { mode: 'misconfigured', reason: `DOCS_AUTH_SECRET is shorter than ${MIN_SECRET_LENGTH} characters` };
  }

  return { mode: 'on', orgs: parsed.orgs, secret };
}

function parseOrgPasswords(raw: string): { orgs: OrgPasswords } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: 'is not valid JSON' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: 'must be a JSON object of { "org": "password" }' };
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return { error: 'has no orgs' };

  const orgs: OrgPasswords = {};
  const seen = new Set<string>();
  for (const [org, password] of entries) {
    if (org.trim().length === 0) return { error: 'has an empty org name' };
    if (typeof password !== 'string' || password.length === 0) {
      return { error: `has an empty or non-string password for "${org}"` };
    }
    // Two orgs sharing a password would make a login ambiguous and revocation leaky.
    if (seen.has(password)) return { error: `has the same password for more than one org (including "${org}")` };
    seen.add(password);
    orgs[org] = password;
  }
  return { orgs };
}
