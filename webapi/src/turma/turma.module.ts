import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { HardwareModule } from '../hardware/hardware.module';
import { TurmaAcessoService } from './turma-acesso.service';
import { TurmaController } from './turma.controller';
import { TurmaPerfilController } from './turma-perfil.controller';

@Module({
  imports: [AuthModule, PrismaModule, HardwareModule],
  // Ordem importa: rotas estáticas de perfil antes de `turma/:trmCodigo`.
  controllers: [TurmaPerfilController, TurmaController],
  providers: [TurmaAcessoService],
  exports: [TurmaAcessoService],
})
export class TurmaModule {}
