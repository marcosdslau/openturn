import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { RegistroPassagemService } from './registro-passagem.service';
import { CreatePassagemDto, QueryPassagemDto } from './dto/passagem.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('passagens')
export class RegistroPassagemController {
    constructor(private service: RegistroPassagemService) { }

    @Post()
    create(@Body() dto: CreatePassagemDto) {
        return this.service.create(dto);
    }

    @Get()
    findAll(@Query() query: QueryPassagemDto) {
        return this.service.findAll(query);
    }
}
