import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { HardwareModule } from '../hardware/hardware.module';
import { TurmaAcessoService } from './turma-acesso.service';
import { EquipamentoAcessoController } from './equipamento-acesso.controller';
import { TurmaController } from './turma.controller';

@Module({
  imports: [AuthModule, PrismaModule, HardwareModule],
  // Ordem importa: rotas estáticas antes de `turma/:trmCodigo`.
  controllers: [EquipamentoAcessoController, TurmaController],
  providers: [TurmaAcessoService],
  exports: [TurmaAcessoService],
})
export class TurmaModule {}
