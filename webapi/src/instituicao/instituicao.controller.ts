import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { InstituicaoService } from './instituicao.service';
import { CreateInstituicaoDto, UpdateInstituicaoDto } from './dto/instituicao.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('instituicoes')
export class InstituicaoController {
    constructor(private service: InstituicaoService) { }

    @Post()
    create(@Body() dto: CreateInstituicaoDto) {
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
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInstituicaoDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }
}
