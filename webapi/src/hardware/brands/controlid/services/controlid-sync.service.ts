import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ControlidCommandQueueService } from './controlid-command-queue.service';

@Injectable()
export class ControlidSyncService {
  private readonly logger = new Logger(ControlidSyncService.name);

  constructor(
    private prisma: PrismaService,
    private readonly commandQueue: ControlidCommandQueueService,
  ) {}

  async syncPessoasToEquipamento(
    equipamentoCodigo: number,
    instituicaoCodigo: number,
  ) {
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

    this.logger.log(
      `Syncing ${pessoas.length} people to device ${equipamentoCodigo}`,
    );

    const users = pessoas.map((p) => ({
      id: p.PESCodigo,
      name: p.PESNome,
      registration: String(p.PESCodigo),
      begin_time: 0,
      end_time: 0,
    }));

    await this.commandQueue.enqueueCommand(
      equipamentoCodigo,
      instituicaoCodigo,
      'create_objects',
      { object: 'users', values: users },
    );

    const cards = pessoas
      .filter((p) => p.PESCartaoTag)
      .map((p) => ({
        user_id: p.PESCodigo,
        value: Number(p.PESCartaoTag),
        type: 0,
      }));

    if (cards.length > 0) {
      await this.commandQueue.enqueueCommand(
        equipamentoCodigo,
        instituicaoCodigo,
        'create_objects',
        { object: 'cards', values: cards },
      );
    }

    this.logger.log(
      `Enqueued sync commands: ${users.length} users, ${cards.length} cards`,
    );

    return {
      usersQueued: users.length,
      cardsQueued: cards.length,
    };
  }
}
