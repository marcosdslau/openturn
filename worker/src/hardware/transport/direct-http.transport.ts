import axios, { AxiosInstance } from 'axios';
import { IHttpTransport } from './http-transport.interface';

export class DirectHttpTransport implements IHttpTransport {
  private readonly client: AxiosInstance;

  constructor(baseURL: string, timeoutMs = 5000) {
    this.client = axios.create({
      baseURL,
      timeout: timeoutMs,
    });
  }

  async post(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ data: unknown }> {
    const res = await this.client.post(path, body, { headers });
    return { data: res.data };
  }
}
