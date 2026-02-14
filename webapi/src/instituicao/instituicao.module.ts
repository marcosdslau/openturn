import { Module } from '@nestjs/common';
import { InstituicaoController } from './instituicao.controller';
import { InstituicaoService } from './instituicao.service';
import { ERPConfigModule } from './erp-config/erp-config.module';

@Module({
  imports: [ERPConfigModule],
  controllers: [InstituicaoController],
  providers: [InstituicaoService]
})
export class InstituicaoModule { }
