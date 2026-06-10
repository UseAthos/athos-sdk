// Tiny console logger gated by `debug` (D-54). Every message uses Athos-domain
// vocabulary only — no vendor noun ever reaches the console.

export interface Logger {
  log(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const PREFIX = "[Athos]";

export function createLogger(debug: boolean): Logger {
  if (!debug) {
    const noop = (): void => {};
    return { log: noop, warn: noop, error: noop };
  }
  return {
    log: (m, ...a) => console.log(`${PREFIX} ${m}`, ...a),
    warn: (m, ...a) => console.warn(`${PREFIX} ${m}`, ...a),
    error: (m, ...a) => console.error(`${PREFIX} ${m}`, ...a),
  };
}
