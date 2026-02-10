import { Module } from '@nestjs/common';
import { InstituicaoController } from './instituicao.controller';
import { InstituicaoService } from './instituicao.service';

@Module({
  controllers: [InstituicaoController],
  providers: [InstituicaoService]
})
export class InstituicaoModule {}
