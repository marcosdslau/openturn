import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { MatriculaService } from './matricula.service';
import { CreateMatriculaDto, UpdateMatriculaDto } from './dto/matricula.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('matriculas')
export class MatriculaController {
    constructor(private service: MatriculaService) { }

    @Post()
    create(@Body() dto: CreateMatriculaDto) {
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
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMatriculaDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }
}
