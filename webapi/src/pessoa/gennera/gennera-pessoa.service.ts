import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HardwareService } from '../../hardware/hardware.service';
import { validatePersonPhoto } from '../../common/face-photo-validation';
import axios, { AxiosInstance } from 'axios';
import {
  GenneraPersonDetail,
  GenneraPersonSearchResult,
  GenneraSyncResult,
} from './gennera-pessoa.types';

const GENNERA_PERSONS_SEARCH_BASE = 'https://persons.gennera.com.br';
const GENNERA_APPS_PHOTO_BASE = 'https://apps.gennera.com.br/public/users/photo';

@Injectable()
export class GenneraPessoaService {
  private readonly logger = new Logger(GenneraPessoaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hardwareService: HardwareService,
  ) {}

  async getErpStatus(
    instituicaoCodigo: number,
  ): Promise<{ ERPSistema: string | null }> {
    const erpConfig = await this.prisma.eRPConfiguracao.findFirst({
      where: { INSInstituicaoCodigo: instituicaoCodigo },
      orderBy: { ERPCodigo: 'desc' },
      select: { ERPSistema: true },
    });
    return { ERPSistema: erpConfig?.ERPSistema ?? null };
  }

  async buscarPessoasPorNome(
    instituicaoCodigo: number,
    name: string,
  ): Promise<GenneraPersonSearchResult[]> {
    const { searchClient } = await this.buildClients(instituicaoCodigo);
    const response = await searchClient.get<GenneraPersonSearchResult[]>(
      '/persons/search',
      {
        params: {
          type: 'name',
          idPersonType: 1,
          name,
        },
      },
    );
    return Array.isArray(response.data) ? response.data : [];
  }

  async sincronizarPessoas(
    instituicaoCodigo: number,
    idPersons: number[] = [],
    envioOnline = true,
  ): Promise<GenneraSyncResult> {
    if (!idPersons.length) {
      return { message: 'Em implementação' };
    }

    const { detailClient } = await this.buildClients(instituicaoCodigo);
    const personsGennera: GenneraPersonDetail[] = [];

    for (const idPerson of idPersons) {
      const response = await detailClient.get<GenneraPersonDetail>(
        `/persons/${idPerson}`,
      );
      personsGennera.push(response.data);
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: { idPerson: number; error: string }[] = [];
    const pescodigosSincronizados: number[] = [];

    for (const pessoa of personsGennera) {
      try {
        const result = await this.upsertPessoaFromGennera(
          instituicaoCodigo,
          pessoa,
          envioOnline,
        );
        if (result.action === 'created') created += 1;
        else updated += 1;
        if (envioOnline) {
          pescodigosSincronizados.push(result.pescodigo);
        }
      } catch (error: any) {
        failed += 1;
        errors.push({
          idPerson: pessoa.idPerson,
          error: error?.message ?? String(error),
        });
        this.logger.warn(
          `Falha ao sincronizar pessoa Gennera idPerson=${pessoa.idPerson}: ${error?.message ?? error}`,
        );
      }
    }

    if (envioOnline && pescodigosSincronizados.length > 0) {
      try {
        await this.hardwareService.syncPerson(
          instituicaoCodigo,
          pescodigosSincronizados,
        );
      } catch (error: unknown) {
        this.logger.warn(
          `Falha ao enviar pessoas para catraca (envio online): ${(error as Error)?.message ?? error}`,
        );
      }
    }

    return {
      message: `Sincronização concluída: ${created} criada(s), ${updated} atualizada(s), ${failed} falha(s).`,
      created,
      updated,
      failed,
      errors: errors.length ? errors : undefined,
    };
  }

  private async buildClients(instituicaoCodigo: number): Promise<{
    searchClient: AxiosInstance;
    detailClient: AxiosInstance;
  }> {
    const erpConfig = await this.prisma.eRPConfiguracao.findFirst({
      where: { INSInstituicaoCodigo: instituicaoCodigo },
      orderBy: { ERPCodigo: 'desc' },
    });

    if (!erpConfig?.ERPUrlBase || !erpConfig.ERPToken) {
      throw new BadRequestException(
        'Configuração ERP não encontrada, URL base ou token ausente.',
      );
    }

    if (erpConfig.ERPSistema !== 'Gennera') {
      throw new BadRequestException(
        `ERP "${erpConfig.ERPSistema}" não suportado. Apenas Gennera é compatível com sincronização de pessoas.`,
      );
    }

    const extraHeaders: Record<string, string> =
      (erpConfig.ERPConfigJson as { headers?: Record<string, string> })
        ?.headers ?? {};

    const commonHeaders = {
      'x-access-token': `${erpConfig.ERPToken}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    return {
      searchClient: axios.create({
        baseURL: GENNERA_PERSONS_SEARCH_BASE,
        headers: commonHeaders,
      }),
      detailClient: axios.create({
        baseURL: erpConfig.ERPUrlBase.replace(/\/$/, ''),
        headers: commonHeaders,
      }),
    };
  }

  private resolveGrupo(
    profiles: GenneraPersonDetail['profiles'],
  ): string {
    if (!profiles?.length) return '';

    for (const profile of profiles) {
      if (profile.idProfile === 4) {
        return profile.profile ?? profile.name ?? '';
      }
    }
    for (const profile of profiles) {
      if (profile.idProfile === 1) {
        return profile.profile ?? profile.name ?? '';
      }
    }
    const last = profiles[profiles.length - 1];
    return last?.profile ?? last?.name ?? '';
  }

  private buildTelefone(
    areaCode?: string | null,
    number?: string | null,
  ): string {
    let value = '';
    if (areaCode) value = `${areaCode}`;
    if (number) value += `${number}`;
    return value;
  }

  private extensaoFromContentType(contentType: string): string {
    let extensao = 'jpg';
    if (contentType.includes('/')) {
      extensao = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    }
    return extensao;
  }

  private async validateAndEncodePhoto(
    buffer: Buffer,
    contentType: string,
    context: string,
  ): Promise<{ base64: string; extensao: string } | null> {
    const validation = await validatePersonPhoto(buffer);
    if (!validation.valid) {
      this.logger.warn(
        `Foto rejeitada (${context}): ${validation.reason ?? 'validação falhou'}`,
      );
      return null;
    }

    return {
      base64: buffer.toString('base64'),
      extensao: this.extensaoFromContentType(contentType),
    };
  }

  private async downloadPhoto(
    photoUrl: string,
    context: string,
  ): Promise<{ base64: string; extensao: string } | null> {
    const response = await axios.get(photoUrl, {
      responseType: 'arraybuffer',
    });
    const buffer = Buffer.from(response.data);
    const contentType =
      (response.headers['content-type'] as string) || 'image/jpeg';
    return this.validateAndEncodePhoto(buffer, contentType, context);
  }

  private async downloadPhotoFromAppsByEmail(
    email: string,
    context: string,
  ): Promise<{ base64: string; extensao: string } | null> {
    const response = await axios.get(GENNERA_APPS_PHOTO_BASE, {
      params: { username: email },
      responseType: 'arraybuffer',
    });
    const buffer = Buffer.from(response.data);
    const contentType =
      (response.headers['content-type'] as string) || 'image/jpeg';
    return this.validateAndEncodePhoto(buffer, contentType, context);
  }

  private async upsertPessoaFromGennera(
    instituicaoCodigo: number,
    pessoa: GenneraPersonDetail,
    envioOnline = true,
  ): Promise<{ action: 'created' | 'updated'; pescodigo: number }> {
    const {
      telephoneAreaCode,
      telephoneNumber,
      mobilePhoneAreaCode,
      mobilePhoneNumber,
      socialName,
      name,
      cpf,
      email,
      active,
      idPerson,
      photo,
      profiles,
    } = pessoa;

    const telefone = this.buildTelefone(telephoneAreaCode, telephoneNumber);
    const celular = this.buildTelefone(
      mobilePhoneAreaCode,
      mobilePhoneNumber,
    );
    const grupo = this.resolveGrupo(profiles);

    const pessoaDAO: Record<string, unknown> = {
      PESNome: socialName || name || `Pessoa ${idPerson}`,
      PESNomeSocial: socialName ?? null,
      PESDocumento: cpf || '',
      PESEmail: email || '',
      PESTelefone: telefone || '',
      PESCelular: celular || '',
      PESGrupo: grupo || null,
      PESAtivo: active ?? true,
      PESIdExterno: String(idPerson),
    };

    if (photo) {
      try {
        const encoded = await this.downloadPhoto(
          photo,
          `idPerson=${idPerson} url`,
        );
        if (encoded) {
          pessoaDAO.PESFotoBase64 = encoded.base64;
          pessoaDAO.PESFotoExtensao = encoded.extensao;
        } else {
          pessoaDAO.PESFotoBase64 = null;
          pessoaDAO.PESFotoExtensao = null;
        }
      } catch (error: any) {
        this.logger.warn(
          `Erro ao baixar foto idPerson=${idPerson}: ${error?.message ?? error}`,
        );
      }
    } else {
      if (email) {
        try {
          const encoded = await this.downloadPhotoFromAppsByEmail(
            email,
            `idPerson=${idPerson} apps`,
          );
          if (encoded) {
            pessoaDAO.PESFotoBase64 = encoded.base64;
            pessoaDAO.PESFotoExtensao = encoded.extensao;
          } else {
            pessoaDAO.PESFotoBase64 = null;
            pessoaDAO.PESFotoExtensao = null;
          }
        } catch (error: any) {
          this.logger.warn(
            `Erro ao baixar foto do app idPerson=${idPerson}: ${error?.message ?? error}`,
          );
        }
      }
    }

    const existing = await this.prisma.rls.pESPessoa.findFirst({
      where: {
        INSInstituicaoCodigo: instituicaoCodigo,
        PESIdExterno: String(idPerson),
        deletedAt: null,
      },
    });

    if (existing) {
      await this.prisma.rls.pESPessoa.update({
        where: { PESCodigo: existing.PESCodigo },
        data: pessoaDAO,
      });
      if (!envioOnline) {
        await this.dispatchPessoaToCatraca(
          instituicaoCodigo,
          existing.PESCodigo,
          envioOnline,
        );
      }
      return { action: 'updated', pescodigo: existing.PESCodigo };
    }

    const created = await this.prisma.rls.pESPessoa.create({
      data: {
        ...pessoaDAO,
        INSInstituicaoCodigo: instituicaoCodigo,
      } as any,
    });

    if (!envioOnline) {
      await this.dispatchPessoaToCatraca(
        instituicaoCodigo,
        created.PESCodigo,
        envioOnline,
      );
    }
    return { action: 'created', pescodigo: created.PESCodigo };
  }

  private async dispatchPessoaToCatraca(
    instituicaoCodigo: number,
    pescodigo: number,
    envioOnline = true,
  ): Promise<void> {
    try {
      await this.hardwareService.dispatchPessoaSync(
        instituicaoCodigo,
        pescodigo,
        envioOnline,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Falha ao enviar pessoa ${pescodigo} para catraca: ${(error as Error)?.message ?? error}`,
      );
    }
  }
}
