import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConnectorService } from './connector.service';
import { WsRelayGateway } from './ws-relay.gateway';

const DEFAULT_TTL_MINUTES = 10;

@Injectable()
export class RemoteSessionService {
    constructor(
        private prisma: PrismaService,
        private connectorService: ConnectorService,
        private wsRelay: WsRelayGateway,
    ) { }

    async listSessions(instituicaoCodigo: number, equipId: number) {
        return this.prisma.rls.rMTSessaoRemota.findMany({
            where: {
                EQPCodigo: equipId,
                INSInstituicaoCodigo: instituicaoCodigo,
                RMTStatus: 'ATIVA',
                RMTExpiraEm: { gt: new Date() },
            },
            include: {
                usuario: {
                    select: {
                        USRCodigo: true,
                        USRNome: true,
                        USREmail: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createSession(
        instituicaoCodigo: number,
        equipId: number,
        userId: number,
        targetIp?: string,
    ) {
        const equip = await this.prisma.rls.eQPEquipamento.findFirst({
            where: {
                EQPCodigo: equipId,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });

        if (!equip) {
            throw new NotFoundException(`Equipamento ${equipId} não encontrado`);
        }

        if (!equip.EQPUsaAddon) {
            throw new BadRequestException(
                'Este equipamento não usa Addon. Acesse diretamente pelo IP.',
            );
        }

        const connector = await this.connectorService.findByInstituicao(instituicaoCodigo);

        if (!this.wsRelay.isConnectorOnline(connector.CONCodigo)) {
            throw new BadRequestException('Connector está offline. Não é possível criar sessão remota.');
        }

        if (!userId) {
            throw new BadRequestException('Usuário não identificado na sessão');
        }

        const expiraEm = new Date(Date.now() + DEFAULT_TTL_MINUTES * 60 * 1000);

        const sessao = await this.prisma.rls.rMTSessaoRemota.create({
            data: {
                equipamento: { connect: { EQPCodigo: equipId } },
                connector: { connect: { CONCodigo: connector.CONCodigo } },
                usuario: { connect: { USRCodigo: userId } },
                instituicao: { connect: { INSCodigo: instituicaoCodigo } },
                RMTTargetIp: targetIp || null,
                RMTStatus: 'ATIVA',
                RMTExpiraEm: expiraEm,
            },
        });

        const gatewayUrl = process.env.REMOTE_GATEWAY_URL || 'http://localhost:8002';
        const absoluteUrl = `${gatewayUrl}/remote/s/${sessao.RMTSessionId}/`;

        return {
            sessionId: sessao.RMTSessionId,
            url: absoluteUrl,
            expiresAt: expiraEm.toISOString(),
        };
    }

    async validateSession(sessionId: string) {
        const sessao = await this.prisma.rMTSessaoRemota.findUnique({
            where: { RMTSessionId: sessionId },
            include: {
                equipamento: true,
                connector: true,
            },
        });

        if (!sessao) {
            throw new NotFoundException('Sessão não encontrada');
        }

        if (sessao.RMTStatus !== 'ATIVA') {
            throw new ForbiddenException('Sessão encerrada ou expirada');
        }

        if (new Date() > sessao.RMTExpiraEm) {
            await this.prisma.rMTSessaoRemota.update({
                where: { RMTCodigo: sessao.RMTCodigo },
                data: { RMTStatus: 'EXPIRADA' },
            });
            throw new ForbiddenException('Sessão expirada');
        }

        if (!this.wsRelay.isConnectorOnline(sessao.CONCodigo)) {
            throw new BadRequestException('Connector offline');
        }

        return sessao;
    }

    async closeSession(
        instituicaoCodigo: number,
        equipId: number,
        sessionId: string,
    ) {
        const sessao = await this.prisma.rls.rMTSessaoRemota.findFirst({
            where: {
                RMTSessionId: sessionId,
                EQPCodigo: equipId,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });

        if (!sessao) {
            throw new NotFoundException('Sessão não encontrada');
        }

        await this.prisma.rls.rMTSessaoRemota.update({
            where: { RMTCodigo: sessao.RMTCodigo },
            data: { RMTStatus: 'ENCERRADA' },
        });

        return { message: 'Sessão encerrada com sucesso.' };
    }
}
