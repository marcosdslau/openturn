import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RotinaModule } from '../rotina/rotina.module';
import { RegistroDiarioSyncScheduler } from './registro-diario-sync.scheduler';
import { RegistroDiarioService } from './registro-diario.service';
import { RegistroDiarioController } from './registro-diario.controller';
import { GenneraAttendanceService } from './gennera-attendance.service';

@Module({
  imports: [PrismaModule, AuthModule, RotinaModule],
  providers: [
    RegistroDiarioSyncScheduler,
    RegistroDiarioService,
    GenneraAttendanceService,
  ],
  controllers: [RegistroDiarioController],
  exports: [RegistroDiarioService],
})
export class RegistroDiarioModule {}
