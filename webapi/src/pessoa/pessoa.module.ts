import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PessoaController } from './pessoa.controller';
import { PessoaService } from './pessoa.service';

@Module({
  imports: [AuthModule],
  controllers: [PessoaController],
  providers: [PessoaService]
})
export class PessoaModule {}
