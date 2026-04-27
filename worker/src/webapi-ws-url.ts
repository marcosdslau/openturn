/**
 * URL do WebSocket do relay na webapi (mesmo path dos connectors).
 * Preferir `WEBAPI_WS_URL`; senão `WEBAPI_WS_HOST` + `WEBAPI_WS_PORT`.
 */
export function getWebApiWsUrl(): string | null {
  const direct = process.env.WEBAPI_WS_URL?.trim();
  if (direct) return direct;

  const host = process.env.WEBAPI_WS_HOST?.trim();
  const port = process.env.WEBAPI_WS_PORT?.trim() || '8001';
  if (host) {
    const scheme = process.env.WEBAPI_WS_SCHEME?.trim() || 'ws';
    return `${scheme}://${host}:${port}/ws/connectors`;
  }

  return null;
}
