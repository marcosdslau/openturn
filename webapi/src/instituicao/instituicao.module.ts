import { Module } from '@nestjs/common';
import { InstituicaoController } from './instituicao.controller';
import { InstituicaoService } from './instituicao.service';
import { ERPConfigModule } from './erp-config/erp-config.module';
import { RotinaModule } from '../rotina/rotina.module';

@Module({
  imports: [ERPConfigModule, RotinaModule],
  controllers: [InstituicaoController],
  providers: [InstituicaoService],
})
export class InstituicaoModule {}
