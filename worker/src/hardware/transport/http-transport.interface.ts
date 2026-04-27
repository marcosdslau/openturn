/**
 * Transporte HTTP mínimo para providers que falam com equipamento via POST (ex.: ControlID .fcgi).
 */
export interface IHttpTransport {
  post(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ data: unknown }>;
}
