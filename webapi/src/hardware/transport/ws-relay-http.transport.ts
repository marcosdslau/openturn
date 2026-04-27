import { WsRelayGateway } from '../../connector/ws-relay.gateway';
import { IHttpTransport } from './http-transport.interface';

/**
 * HTTP via Connector (addon): cada POST é enviado pelo relay para o equipamento em `baseUrl`.
 */
export class WsRelayHttpTransport implements IHttpTransport {
  constructor(
    private readonly wsRelay: WsRelayGateway,
    private readonly connectorId: number,
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

    const res = await this.wsRelay.sendHttpRequest(
      this.connectorId,
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
