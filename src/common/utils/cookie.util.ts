/**
 * Parses a raw cookie header string into a key-value map.
 * Handles edge cases: missing header, empty values, encoded characters.
 */
export function parseCookieHeader(
  cookieHeader: string | undefined | null,
): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};

  for (const pair of cookieHeader.split(';')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;

    const key = pair.substring(0, eqIdx).trim();
    const value = pair.substring(eqIdx + 1).trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }

  return cookies;
}
