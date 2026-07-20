import { Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ErpPhotoProvider } from '../erp-photo.types';

interface ErpConfig {
  ERPUrlBase: string;
  ERPToken: string;
  ERPConfigJson?: unknown;
}

export class GenneraPhotoService implements ErpPhotoProvider {
  readonly erpSistema = 'Gennera';
  private readonly logger = new Logger(GenneraPhotoService.name);
  private readonly client: AxiosInstance;

  constructor(erpConfig: ErpConfig) {
    const extraHeaders: Record<string, string> =
      (erpConfig.ERPConfigJson as { headers?: Record<string, string> })
        ?.headers ?? {};

    this.client = axios.create({
      baseURL: erpConfig.ERPUrlBase.replace(/\/$/, ''),
      headers: {
        'x-access-token': erpConfig.ERPToken,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    });
  }

  async enviarFoto(
    idPersonExterno: string,
    base64: string,
  ): Promise<{ ok: boolean; erro?: string }> {
    try {
      await this.client.post(`/persons/${idPersonExterno}/photo`, {
        name: `foto_${idPersonExterno}.jpg`,
        base64,
      });
      return { ok: true };
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? err?.message ?? String(err);
      this.logger.warn(
        `Falha ao enviar foto ao Gennera idPerson=${idPersonExterno}: ${msg}`,
      );
      return { ok: false, erro: msg };
    }
  }
}
