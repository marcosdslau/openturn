import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';
import { HardwareService } from '../hardware/hardware.service';
import { BrevoMailService } from '../auth/brevo-mail.service';
import { GenneraPessoaService } from '../pessoa/gennera/gennera-pessoa.service';
import { ErpPhotoFactory } from '../pessoa/erp-photo/erp-photo.factory';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';
import {
  checkRateLimit,
  wizardRateLimitKey,
} from '../common/redis/rate-limit.helper';
import { WizardEtapa, WizardTokenPayload } from './wizard-token.guard';

const OTP_TTL_SEC = 10 * 60;
const OTP_RESEND_COOLDOWN_SEC = 180;
const OTP_MAX_TENTATIVAS = 5;
const WIZARD_TOKEN_TTL = '10m';

@Injectable()
export class WizardFotoService {
  private readonly logger = new Logger(WizardFotoService.name);
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly brevoMail: BrevoMailService,
    private readonly hardwareService: HardwareService,
    private readonly genneraPessoaService: GenneraPessoaService,
  ) {}

  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis(getRedisConnectionOptions());
    }
    return this.redis;
  }

  private hashCodigo(codigo: string): string {
    return createHash('sha256').update(codigo).digest('hex');
  }

  private emitirWizardToken(
    pesCodigo: number,
    instituicaoCodigo: number,
    etapa: WizardEtapa,
  ): string {
    const payload: WizardTokenPayload = { pesCodigo, instituicaoCodigo, etapa };
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET || 'openturn_super_secret_key',
      expiresIn: WIZARD_TOKEN_TTL,
    });
  }

  async verificarEmail(
    instituicaoCodigo: number,
    email: string,
    ip: string,
  ): Promise<{ encontrado: boolean; wizardToken?: string }> {
    const redis = this.getRedis();

    const [byIp, byEmail] = await Promise.all([
      checkRateLimit(
        redis,
        wizardRateLimitKey(`email:ip:${ip}`),
        5,
        60,
      ),
      checkRateLimit(
        redis,
        wizardRateLimitKey(`email:addr:${email.toLowerCase()}`),
        10,
        3600,
      ),
    ]);

    if (!byIp.allowed || !byEmail.allowed) {
      throw new HttpException(
        'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const pessoa = await this.resolverPessoa(instituicaoCodigo, email);
    if (!pessoa) {
      return { encontrado: false };
    }

    const wizardToken = this.emitirWizardToken(
      pessoa.PESCodigo,
      instituicaoCodigo,
      'EMAIL_OK',
    );
    return { encontrado: true, wizardToken };
  }

  async enviarOtp(
    pesCodigo: number,
    instituicaoCodigo: number,
  ): Promise<{ enviado: boolean; proximoReenvioEm: number }> {
    const pessoa = await this.prisma.rls.pESPessoa.findUnique({
      where: { PESCodigo: pesCodigo },
      select: { PESEmail: true },
    });

    if (!pessoa?.PESEmail) {
      throw new NotFoundException('Pessoa não possui e-mail cadastrado.');
    }

    const ultimoOtp = await this.prisma.rls.pESFotoOtp.findFirst({
      where: { PESCodigo: pesCodigo, INSInstituicaoCodigo: instituicaoCodigo },
      orderBy: { createdAt: 'desc' },
    });

    if (ultimoOtp) {
      const elapsed = Math.floor(
        (Date.now() - ultimoOtp.createdAt.getTime()) / 1000,
      );
      if (elapsed < OTP_RESEND_COOLDOWN_SEC) {
        const restante = OTP_RESEND_COOLDOWN_SEC - elapsed;
        throw new HttpException(
          `Aguarde ${restante} segundos antes de reenviar.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const num = randomInt(0, 1_000_000);
    const codigo = num.toString().padStart(6, '0');
    const hash = this.hashCodigo(codigo);
    const expiraEm = new Date(Date.now() + OTP_TTL_SEC * 1000);

    await this.prisma.rls.$transaction(async (tx) => {
      await (tx as any).pESFotoOtp.deleteMany({
        where: { PESCodigo: pesCodigo, INSInstituicaoCodigo: instituicaoCodigo },
      });
      await (tx as any).pESFotoOtp.create({
        data: {
          PESCodigo: pesCodigo,
          INSInstituicaoCodigo: instituicaoCodigo,
          POTCodigoHash: hash,
          POTTentativas: 0,
          POTExpiraEm: expiraEm,
        },
      });
    });

    await this.brevoMail.sendOtpEmail(pessoa.PESEmail, codigo);

    return { enviado: true, proximoReenvioEm: OTP_RESEND_COOLDOWN_SEC };
  }

  async verificarOtp(
    pesCodigo: number,
    instituicaoCodigo: number,
    codigo: string,
    ip: string,
  ): Promise<{ valido: boolean; wizardToken?: string }> {
    const redis = this.getRedis();
    const rl = await checkRateLimit(
      redis,
      wizardRateLimitKey(`otp:ip:${ip}`),
      10,
      60,
    );

    if (!rl.allowed) {
      throw new HttpException(
        'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const hash = this.hashCodigo(codigo);

    const otp = await this.prisma.rls.pESFotoOtp.findFirst({
      where: { PESCodigo: pesCodigo, INSInstituicaoCodigo: instituicaoCodigo },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return { valido: false };
    }

    if (otp.POTTentativas >= OTP_MAX_TENTATIVAS) {
      await this.prisma.rls.pESFotoOtp.deleteMany({
        where: { PESCodigo: pesCodigo, INSInstituicaoCodigo: instituicaoCodigo },
      });
      return { valido: false };
    }

    if (otp.POTExpiraEm < new Date()) {
      await this.prisma.rls.pESFotoOtp.deleteMany({
        where: { PESCodigo: pesCodigo, INSInstituicaoCodigo: instituicaoCodigo },
      });
      return { valido: false };
    }

    if (otp.POTCodigoHash !== hash) {
      await this.prisma.rls.pESFotoOtp.update({
        where: { POTCodigo: otp.POTCodigo },
        data: { POTTentativas: { increment: 1 } },
      });
      return { valido: false };
    }

    await this.prisma.rls.pESFotoOtp.deleteMany({
      where: { PESCodigo: pesCodigo, INSInstituicaoCodigo: instituicaoCodigo },
    });

    const wizardToken = this.emitirWizardToken(
      pesCodigo,
      instituicaoCodigo,
      'OTP_OK',
    );
    return { valido: true, wizardToken };
  }

  async salvarFoto(
    instituicaoCodigo: number,
    pesCodigo: number,
    fotoBase64: string,
  ): Promise<{ sucesso: boolean }> {
    const [pessoa, erpConfig] = await Promise.all([
      this.prisma.rls.pESPessoa.findUnique({ where: { PESCodigo: pesCodigo } }),
      this.prisma.rls.eRPConfiguracao.findFirst({
        where: { INSInstituicaoCodigo: instituicaoCodigo },
        orderBy: { ERPCodigo: 'desc' },
      }),
    ]);

    if (!pessoa) {
      throw new NotFoundException('Pessoa não encontrada.');
    }

    // 1) ERP primeiro — se falhar, nada local é tocado
    if (erpConfig && pessoa.PESIdExterno) {
      const resultado = await ErpPhotoFactory.create(erpConfig).enviarFoto(
        pessoa.PESIdExterno,
        fotoBase64,
      );
      if (!resultado.ok) {
        throw new BadGatewayException(
          `Falha ao enviar foto ao ERP: ${resultado.erro}`,
        );
      }
    }

    // 2) PESPessoa local
    await this.prisma.rls.pESPessoa.update({
      where: { PESCodigo: pesCodigo },
      data: { PESFotoBase64: fotoBase64, PESFotoExtensao: 'jpg' },
    });

    // 3) Catracas
    try {
      await this.hardwareService.syncPerson(instituicaoCodigo, [pesCodigo]);
    } catch (err) {
      throw new BadGatewayException(
        `Falha ao sincronizar com os equipamentos: ${(err as Error).message}`,
      );
    }

    return { sucesso: true };
  }

  private async resolverPessoa(
    instituicaoCodigo: number,
    email: string,
  ) {
    const local = await this.prisma.rls.pESPessoa.findFirst({
      where: {
        INSInstituicaoCodigo: instituicaoCodigo,
        PESEmail: { equals: email, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (local) return local;

    const erpConfig = await this.prisma.rls.eRPConfiguracao.findFirst({
      where: { INSInstituicaoCodigo: instituicaoCodigo },
      orderBy: { ERPCodigo: 'desc' },
    });
    if (!erpConfig) return null;

    let searchResult: Awaited<
      ReturnType<GenneraPessoaService['buscarPessoaPorEmail']>
    >;
    try {
      searchResult = await this.genneraPessoaService.buscarPessoaPorEmail(
        instituicaoCodigo,
        email,
      );
    } catch (err) {
      this.logger.warn(
        `Erro ao buscar pessoa no ERP por e-mail (${email}): ${(err as Error).message}`,
      );
      return null;
    }

    if (!searchResult) return null;

    const detailClient = await this.buildGenneraDetailClient(erpConfig);
    if (!detailClient) return null;

    let detail: import('../pessoa/gennera/gennera-pessoa.types').GenneraPersonDetail;
    try {
      const { default: axios } = await import('axios');
      const res = await detailClient.get(
        `/persons/${searchResult.idPerson}`,
      );
      detail = res.data;
    } catch (err) {
      this.logger.warn(
        `Erro ao buscar detalhe do Gennera idPerson=${searchResult.idPerson}: ${(err as Error).message}`,
      );
      return null;
    }

    const { pescodigo } =
      await this.genneraPessoaService.upsertPessoaFromGennera(
        instituicaoCodigo,
        detail,
        false,
      );

    return this.prisma.rls.pESPessoa.findUnique({
      where: { PESCodigo: pescodigo },
    });
  }

  private async buildGenneraDetailClient(erpConfig: {
    ERPUrlBase?: string | null;
    ERPToken?: string | null;
    ERPConfigJson?: unknown;
    ERPSistema: string;
  }) {
    if (
      erpConfig.ERPSistema !== 'Gennera' ||
      !erpConfig.ERPUrlBase ||
      !erpConfig.ERPToken
    ) {
      return null;
    }
    const { default: axios } = await import('axios');
    const extraHeaders: Record<string, string> =
      (erpConfig.ERPConfigJson as { headers?: Record<string, string> })
        ?.headers ?? {};
    return axios.create({
      baseURL: erpConfig.ERPUrlBase.replace(/\/$/, ''),
      headers: {
        'x-access-token': erpConfig.ERPToken,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    });
  }
}
