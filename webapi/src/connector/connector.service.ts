import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PairConnectorDto } from './dto/connector.dto';
import { randomBytes } from 'crypto';
import { sign } from 'jsonwebtoken';

@Injectable()
export class ConnectorService {
    constructor(private prisma: PrismaService) { }

    async pair(instituicaoCodigo: number, dto: PairConnectorDto) {
        const instituicao = await this.prisma.rls.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
            include: { connector: true },
        });

        if (!instituicao) {
            throw new NotFoundException(`Instituição ${instituicaoCodigo} não encontrada`);
        }

        if (instituicao.connector) {
            throw new ConflictException(
                'Esta instituição já possui um Connector pareado. Despareie o atual antes de parear um novo.',
            );
        }

        // Create the connector record first (with a placeholder token)
        const connector = await this.prisma.rls.cONConnector.create({
            data: {
                CONNome: dto.CONNome,
                CONToken: 'pending',
                CONStatus: 'PAIRING',
                CLICodigo: instituicao.CLICodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });

        // Now generate the token with the actual CONCodigo
        const token = this.generateConnectorToken(
            connector.CONCodigo,
            instituicaoCodigo,
            instituicao.CLICodigo,
        );

        // Update the token in DB
        await this.prisma.rls.cONConnector.update({
            where: { CONCodigo: connector.CONCodigo },
            data: { CONToken: token },
        });

        return {
            connectorId: connector.CONCodigo,
            token,
            wsUrl: `/ws/connectors`,
            message: 'Connector pareado. Use o token para conectar via WSS.',
        };
    }

    async renewToken(instituicaoCodigo: number) {
        const connector = await this.findByInstituicao(instituicaoCodigo);

        const token = this.generateConnectorToken(
            connector.CONCodigo,
            instituicaoCodigo,
            connector.CLICodigo,
        );

        await this.prisma.rls.cONConnector.update({
            where: { CONCodigo: connector.CONCodigo },
            data: { CONToken: token },
        });

        return { token, message: 'Token renovado. Reinicie o Connector com o novo token.' };
    }

    async getStatus(instituicaoCodigo: number) {
        const connector = await this.prisma.rls.cONConnector.findUnique({
            where: { INSInstituicaoCodigo: instituicaoCodigo },
        });

        if (!connector) {
            return { paired: false, status: null };
        }

        return {
            paired: true,
            connectorId: connector.CONCodigo,
            nome: connector.CONNome,
            status: connector.CONStatus,
            versao: connector.CONVersao,
            ultimoHeartbeat: connector.CONUltimoHeartbeat,
            metadata: connector.CONMetadata,
        };
    }

    async unpair(instituicaoCodigo: number) {
        const connector = await this.findByInstituicao(instituicaoCodigo);

        await this.prisma.rls.cONConnector.delete({
            where: { CONCodigo: connector.CONCodigo },
        });

        return { message: 'Connector despareado da instituição.' };
    }

    async findByInstituicao(instituicaoCodigo: number) {
        const connector = await this.prisma.rls.cONConnector.findUnique({
            where: { INSInstituicaoCodigo: instituicaoCodigo },
        });

        if (!connector) {
            throw new NotFoundException(
                `Nenhum Connector pareado para a instituição ${instituicaoCodigo}`,
            );
        }

        return connector;
    }

    async updateHeartbeat(connectorId: number, versao?: string, metadata?: any) {
        return this.prisma.cONConnector.update({
            where: { CONCodigo: connectorId },
            data: {
                CONStatus: 'ONLINE',
                CONUltimoHeartbeat: new Date(),
                ...(versao && { CONVersao: versao }),
                ...(metadata && { CONMetadata: metadata }),
            },
        });
    }

    async setOffline(connectorId: number) {
        return this.prisma.cONConnector.update({
            where: { CONCodigo: connectorId },
            data: { CONStatus: 'OFFLINE' },
        });
    }

    private generateConnectorToken(
        connectorId: number,
        instituicaoCodigo: number,
        clienteCodigo: number,
    ): string {
        const secret = process.env.JWT_SECRET || 'openturn-connector-secret';
        return sign(
            {
                sub: `connector:${connectorId}`,
                instituicaoCodigo,
                clienteCodigo,
                type: 'connector',
            },
            secret,
            { expiresIn: '365d' },
        );
    }
}
