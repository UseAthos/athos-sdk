export type GateEnv = {
  DOCS_PASSWORD?: string;
  DOCS_AUTH_SECRET?: string;
  NODE_ENV?: string;
};

export type Gate =
  | { mode: 'on'; password: string; secret: string }
  | { mode: 'off' }
  | { mode: 'misconfigured' };

// HS256 keys should be at least 256 bits; 32 characters is the floor we accept.
export const MIN_SECRET_LENGTH = 32;

// The gate is on whenever DOCS_PASSWORD is set. With no password, local
// development runs open, but production fails closed rather than serving the
// site to everyone. A password without a strong signing secret is always a
// mistake, so that fails closed too.
export function resolveGate(env: GateEnv = process.env): Gate {
  const password = env.DOCS_PASSWORD;
  const secret = env.DOCS_AUTH_SECRET;

  if (password && secret && secret.length >= MIN_SECRET_LENGTH) return { mode: 'on', password, secret };
  if (!password && env.NODE_ENV !== 'production') return { mode: 'off' };
  return { mode: 'misconfigured' };
}
