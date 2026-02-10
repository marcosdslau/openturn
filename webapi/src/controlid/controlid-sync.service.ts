import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ControlidService } from './controlid.service';

@Injectable()
export class ControlidSyncService {
    private readonly logger = new Logger(ControlidSyncService.name);

    constructor(
        private prisma: PrismaService,
        private controlidService: ControlidService,
    ) { }

    /**
     * Sincroniza todas as pessoas ativas de uma instituição com um equipamento específico.
     * Enfileira comandos Push para criar/atualizar usuários no equipment ControlId.
     */
    async syncPessoasToEquipamento(equipamentoCodigo: number, instituicaoCodigo: number) {
        const pessoas = await this.prisma.pESPessoa.findMany({
            where: {
                INSInstituicaoCodigo: instituicaoCodigo,
                PESAtivo: true,
                deletedAt: null,
            },
            select: {
                PESCodigo: true,
                PESNome: true,
                PESCartaoTag: true,
            },
        });

        this.logger.log(`Syncing ${pessoas.length} people to device ${equipamentoCodigo}`);

        // Enfileira um create_objects para cada pessoa (batch)
        const users = pessoas.map((p) => ({
            id: p.PESCodigo,
            name: p.PESNome,
            registration: String(p.PESCodigo),
            begin_time: 0,
            end_time: 0,
        }));

        // Envia usuários em batch via create_objects
        await this.controlidService.enqueueCommand(
            equipamentoCodigo,
            instituicaoCodigo,
            'create_objects',
            { object: 'users', values: users },
        );

        // Se houver cartões/tags, sincronizar também
        const cards = pessoas
            .filter((p) => p.PESCartaoTag)
            .map((p) => ({
                user_id: p.PESCodigo,
                value: Number(p.PESCartaoTag),
                type: 0,
            }));

        if (cards.length > 0) {
            await this.controlidService.enqueueCommand(
                equipamentoCodigo,
                instituicaoCodigo,
                'create_objects',
                { object: 'cards', values: cards },
            );
        }

        this.logger.log(`Enqueued sync commands: ${users.length} users, ${cards.length} cards`);

        return {
            usersQueued: users.length,
            cardsQueued: cards.length,
        };
    }
}
