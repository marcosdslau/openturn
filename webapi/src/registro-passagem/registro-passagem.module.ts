import { Module } from '@nestjs/common';
import { RegistroPassagemController } from './registro-passagem.controller';
import { RegistroPassagemService } from './registro-passagem.service';

@Module({
    controllers: [RegistroPassagemController],
    providers: [RegistroPassagemService],
    exports: [RegistroPassagemService],
})
export class RegistroPassagemModule { }
