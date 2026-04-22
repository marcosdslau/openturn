import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegistroPassagemController } from './registro-passagem.controller';
import { RegistroPassagemService } from './registro-passagem.service';

@Module({
    imports: [AuthModule],
    controllers: [RegistroPassagemController],
    providers: [RegistroPassagemService],
    exports: [RegistroPassagemService],
})
export class RegistroPassagemModule { }
