import { Module } from '@nestjs/common';
import { NotificacaoController } from './notificacao.controller';
import { NotificacaoService } from './notificacao.service';

@Module({
  controllers: [NotificacaoController],
  providers: [NotificacaoService],
})
export class NotificacaoModule {}

