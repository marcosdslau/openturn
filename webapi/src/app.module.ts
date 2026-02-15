import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { ControlidModule } from './controlid/controlid.module';
import { UsuarioModule } from './usuario/usuario.module';
import { AdminUsuarioModule } from './admin-usuario/admin-usuario.module';
import { RotinaModule } from './rotina/rotina.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ClienteModule,
    InstituicaoModule,
    PessoaModule,
    MatriculaModule,
    EquipamentoModule,
    RegistroPassagemModule,
    ControlidModule,
    UsuarioModule,
    AdminUsuarioModule,
    RotinaModule,
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

