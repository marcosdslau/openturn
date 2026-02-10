import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PessoaService } from './pessoa.service';
import { CreatePessoaDto, UpdatePessoaDto } from './dto/pessoa.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('pessoas')
export class PessoaController {
    constructor(private service: PessoaService) { }

    @Post()
    create(@Body() dto: CreatePessoaDto) {
        return this.service.create(dto);
    }

    @Get()
    findAll(@Query() query: PaginationDto) {
        return this.service.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Put(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePessoaDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }
}
