const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical hyphenated UUID in any letter case; anything else, including non-strings, is refused. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}
