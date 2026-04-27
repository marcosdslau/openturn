import { IHttpTransport } from './http-transport.interface';
import { WsRelayClient } from '../relay/ws-relay-client';

/**
 * HTTP via relay (addon): cada POST é enviado pelo cliente WS interno ao gateway,
 * que repassa ao connector — equivalente a
 * [webapi/transport/ws-relay-http.transport.ts](webapi), mas com `tenantId` no lugar
 * do `connectorId` (o gateway roteia por instituição).
 */
export class WsRelayClientHttpTransport implements IHttpTransport {
  constructor(
    private readonly client: WsRelayClient,
    private readonly tenantId: number,
    private readonly equipId: number,
    private readonly baseUrl: string,
  ) {}

  async post(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ data: unknown }> {
    let bodyStr: string | null = null;
    if (body instanceof Buffer) {
      bodyStr = body.toString('binary');
    } else if (body !== undefined && body !== null) {
      bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await this.client.sendHttpRequest(
      this.tenantId,
      this.equipId,
      this.baseUrl,
      'POST',
      path,
      headers,
      bodyStr,
    );

    const text = res.body.toString('utf-8');
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* corpo não-JSON */
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const err: any = new Error(`Relay HTTP ${res.statusCode}`);
      err.response = { status: res.statusCode, data };
      throw err;
    }

    return { data };
  }
}
