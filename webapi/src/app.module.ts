import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './common/prisma/prisma.service';
import { TenantService } from './common/tenant/tenant.service';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { ClienteModule } from './cliente/cliente.module';
import { InstituicaoModule } from './instituicao/instituicao.module';
import { PessoaModule } from './pessoa/pessoa.module';
import { CatracaModule } from './catraca/catraca.module';

@Module({
  imports: [ClienteModule, InstituicaoModule, PessoaModule, CatracaModule],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    TenantService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule { }
