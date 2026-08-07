import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { PrismaConnectionExceptionFilter } from './common/filters/prisma-connection-exception.filter';
import { AuthModule } from './auth/auth.module';
import { ClienteModule } from './cliente/cliente.module';
import { InstituicaoModule } from './instituicao/instituicao.module';
import { PessoaModule } from './pessoa/pessoa.module';
import { MatriculaModule } from './matricula/matricula.module';
import { EquipamentoModule } from './equipamento/equipamento.module';
import { RegistroPassagemModule } from './registro-passagem/registro-passagem.module';
import { HardwareModule } from './hardware/hardware.module';
import { UsuarioModule } from './usuario/usuario.module';
import { AdminUsuarioModule } from './admin-usuario/admin-usuario.module';
import { RotinaModule } from './rotina/rotina.module';
import { ConnectorModule } from './connector/connector.module';
import { AiModule } from './modules/ai/ai.module';
import { MonitorModule } from './monitor/monitor.module';
import { RegistroDiarioModule } from './registro-diario/registro-diario.module';
import { NotificacaoModule } from './notificacao/notificacao.module';
import { VisitanteModule } from './visitante/visitante.module';
import { WizardFotoModule } from './wizard-foto/wizard-foto.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ClienteModule,
    InstituicaoModule,
    PessoaModule,
    MatriculaModule,
    EquipamentoModule,
    RegistroPassagemModule,
    HardwareModule,
    UsuarioModule,
    AdminUsuarioModule,
    RotinaModule,
    ConnectorModule,
    AiModule,
    MonitorModule,
    RegistroDiarioModule,
    NotificacaoModule,
    VisitanteModule,
    WizardFotoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaConnectionExceptionFilter,
    },
  ],
})
export class AppModule {}
