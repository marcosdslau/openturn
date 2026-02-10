import { Module } from '@nestjs/common';
import { MatriculaController } from './matricula.controller';
import { MatriculaService } from './matricula.service';

@Module({
    controllers: [MatriculaController],
    providers: [MatriculaService],
})
export class MatriculaModule { }
