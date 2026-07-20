import { ErpPhotoProvider } from './erp-photo.types';
import { GenneraPhotoService } from './brands/gennera-photo.service';
import { NoopPhotoProvider } from './brands/noop-photo.provider';

interface ErpConfig {
  ERPSistema: string;
  ERPUrlBase?: string | null;
  ERPToken?: string | null;
  ERPConfigJson?: unknown;
}

export class ErpPhotoFactory {
  static create(erpConfig: ErpConfig | null | undefined): ErpPhotoProvider {
    if (
      erpConfig?.ERPSistema === 'Gennera' &&
      erpConfig.ERPUrlBase &&
      erpConfig.ERPToken
    ) {
      return new GenneraPhotoService({
        ERPUrlBase: erpConfig.ERPUrlBase,
        ERPToken: erpConfig.ERPToken,
        ERPConfigJson: erpConfig.ERPConfigJson,
      });
    }
    return new NoopPhotoProvider();
  }
}
