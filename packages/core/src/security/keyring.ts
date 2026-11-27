/**
 * Versioned key rings from env (ADR-0021, ADR-0024): a JSON object of `{ "<id>": "<base64 key>" }`.
 * Ids are small positive integers so they fit the `v{n}:` / `k{n}.` prefixes and the
 * `key_version int` columns. Parsing errors never include key material.
 */

export interface KeyringRules {
  /** Exact decoded length (AES-256 keys must be 32 bytes). */
  exactBytes?: number;
  /** Minimum decoded length (HMAC keys). */
  minBytes?: number;
}

const ID = /^[1-9][0-9]{0,5}$/;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** Parse and validate a key ring. Throws an Error with a safe message on any problem. */
export function parseKeyring(json: string, rules: KeyringRules): Map<number, Buffer> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('must be a JSON object like {"1":"<base64 key>"}');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('must be a JSON object like {"1":"<base64 key>"}');
  }
  const keys = new Map<number, Buffer>();
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ID.test(id)) throw new Error(`key id "${id}" must be a positive integer`);
    if (typeof value !== 'string' || !BASE64.test(value)) {
      throw new Error(`key ${id} must be a base64 string`);
    }
    const key = Buffer.from(value, 'base64');
    if (rules.exactBytes !== undefined && key.length !== rules.exactBytes) {
      throw new Error(`key ${id} must decode to exactly ${rules.exactBytes} bytes`);
    }
    if (rules.minBytes !== undefined && key.length < rules.minBytes) {
      throw new Error(`key ${id} must decode to at least ${rules.minBytes} bytes`);
    }
    keys.set(Number(id), key);
  }
  if (keys.size === 0) throw new Error('must contain at least one key');
  return keys;
}

/** Parse a key ring and check that the active id is part of it. */
export function parseActiveKeyring(
  json: string,
  activeId: number,
  rules: KeyringRules,
): { keys: Map<number, Buffer>; activeId: number } {
  const keys = parseKeyring(json, rules);
  if (!keys.has(activeId)) throw new Error(`active key ${activeId} is not in the key ring`);
  return { keys, activeId };
}
