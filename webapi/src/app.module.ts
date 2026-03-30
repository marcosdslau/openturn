import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { getRedisConnectionOptions } from './common/redis/redis-connection';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { AuthModule } from './auth/auth.module';
import { ClienteModule } from './cliente/cliente.module';
import { InstituicaoModule } from './instituicao/instituicao.module';
import { PessoaModule } from './pessoa/pessoa.module';
import { MatriculaModule } from './matricula/matricula.module';
import { EquipamentoModule } from './equipamento/equipamento.module';
import { RegistroPassagemModule } from './registro-passagem/registro-passagem.module';
import { HardwareModule } from './hardware/hardware.module';
import { ControlidModule } from './controlid/controlid.module';
import { UsuarioModule } from './usuario/usuario.module';
import { AdminUsuarioModule } from './admin-usuario/admin-usuario.module';
import { RotinaModule } from './rotina/rotina.module';
import { ConnectorModule } from './connector/connector.module';
import { AiModule } from './modules/ai/ai.module';
import { MonitorModule } from './monitor/monitor.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: getRedisConnectionOptions(),
    }),
    PrismaModule,
    AuthModule,
    ClienteModule,
    InstituicaoModule,
    PessoaModule,
    MatriculaModule,
    EquipamentoModule,
    EquipamentoModule,
    RegistroPassagemModule,
    HardwareModule,
    ControlidModule,
    UsuarioModule,
    AdminUsuarioModule,
    RotinaModule,
    ConnectorModule,
    AiModule,
    MonitorModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule { }

