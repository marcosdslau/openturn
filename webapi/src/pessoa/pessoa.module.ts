import { Module } from '@nestjs/common';
import { PessoaController } from './pessoa.controller';
import { PessoaService } from './pessoa.service';

@Module({
  controllers: [PessoaController],
  providers: [PessoaService]
})
export class PessoaModule {}
