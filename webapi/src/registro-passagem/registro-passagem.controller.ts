import { Controller, Get, Post, Body, Query, UseGuards, Param, ParseIntPipe } from '@nestjs/common';
import { RegistroPassagemService } from './registro-passagem.service';
import { CreatePassagemDto, QueryPassagemDto } from './dto/passagem.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('instituicao/:instituicaoCodigo/passagem')
export class RegistroPassagemController {
    constructor(private service: RegistroPassagemService) { }

    @Post()
    create(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() dto: CreatePassagemDto
    ) {
        return this.service.create(instituicaoCodigo, dto);
    }

    @Get()
    findAll(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Query() query: QueryPassagemDto
    ) {
        return this.service.findAll(instituicaoCodigo, query);
    }
}
