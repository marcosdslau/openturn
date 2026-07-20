import { ErpPhotoProvider } from '../erp-photo.types';

export class NoopPhotoProvider implements ErpPhotoProvider {
  readonly erpSistema = 'Noop';

  async enviarFoto(
    _idPersonExterno: string,
    _base64: string,
  ): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}
