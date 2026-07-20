export interface ErpPhotoProvider {
  erpSistema: string;
  enviarFoto(
    idPersonExterno: string,
    base64: string,
  ): Promise<{ ok: boolean; erro?: string }>;
}
