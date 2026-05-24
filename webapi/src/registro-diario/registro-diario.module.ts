import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RotinaModule } from '../rotina/rotina.module';
import { RegistroDiarioSyncScheduler } from './registro-diario-sync.scheduler';
import { FreqEducacionalSyncScheduler } from './freq-educacional-sync.scheduler';
import { RegistroDiarioService } from './registro-diario.service';
import { RegistroDiarioManutencaoService } from './registro-diario-manutencao.service';
import { RegistroDiarioController } from './registro-diario.controller';
import { GenneraAttendanceService } from './gennera-attendance.service';
import { PeriodoRegistroService } from './periodo-registro.service';
import { PeriodoRegistroController } from './periodo-registro.controller';

@Module({
  imports: [PrismaModule, AuthModule, RotinaModule],
  providers: [
    RegistroDiarioSyncScheduler,
    FreqEducacionalSyncScheduler,
    RegistroDiarioService,
    RegistroDiarioManutencaoService,
    GenneraAttendanceService,
    PeriodoRegistroService,
  ],
  controllers: [RegistroDiarioController, PeriodoRegistroController],
  exports: [RegistroDiarioService],
})
export class RegistroDiarioModule {}
