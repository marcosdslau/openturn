import {
  Controller,
  Post,
  Param,
  ParseIntPipe,
  Logger,
  Body,
  UseGuards,
} from '@nestjs/common';
import { HardwareService } from '../hardware.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';
import { TestConnectionDto } from '../dto/test-connection.dto';
import { ConfigureEquipmentDto } from '../dto/configure-equipment.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/hardware')
export class HardwareController {
  private readonly logger = new Logger(HardwareController.name);

  constructor(private readonly hardwareService: HardwareService) {}

  @Post('sync')
  @RequirePermission('equipamento', 'update')
  async syncAll(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
  ) {
    this.logger.log(`[${instituicaoCodigo}] Starting full synchronization...`);
    await this.hardwareService.syncAll(instituicaoCodigo);
    return { message: 'Synchronization started' };
  }

  @Post('person/:pescodigo/sync')
  @RequirePermission('equipamento', 'update')
  async syncPersonAcrossInstitution(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('pescodigo', ParseIntPipe) pescodigo: number,
  ) {
    this.logger.log(
      `[${instituicaoCodigo}] sync person ${pescodigo} across equipment`,
    );
    return this.hardwareService.syncPersonAcrossInstitution(
      instituicaoCodigo,
      pescodigo,
    );
  }

  @Post('person/:pescodigo/delete-from-devices')
  @RequirePermission('equipamento', 'update')
  async deletePersonAcrossInstitution(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('pescodigo', ParseIntPipe) pescodigo: number,
  ) {
    this.logger.log(
      `[${instituicaoCodigo}] delete person ${pescodigo} from all active equipment`,
    );
    return this.hardwareService.deletePersonAcrossInstitution(
      instituicaoCodigo,
      pescodigo,
    );
  }

  @Post(':equipmentId/configure-equipment')
  @RequirePermission('equipamento', 'update')
  async configureEquipment(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('equipmentId', ParseIntPipe) equipmentId: number,
    @Body() dto: ConfigureEquipmentDto,
  ) {
    this.logger.log(
      `[${instituicaoCodigo}] configure-equipment type=${dto.type} on device ${equipmentId}`,
    );
    return await this.hardwareService.applyEquipmentConfiguration(
      instituicaoCodigo,
      equipmentId,
      dto.type,
    );
  }

  @Post(':equipmentId/delete-all-users')
  @RequirePermission('equipamento', 'update')
  async deleteAllUsers(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('equipmentId', ParseIntPipe) equipmentId: number,
  ) {
    this.logger.log(
      `[${instituicaoCodigo}] delete-all-users on equipment ${equipmentId}`,
    );
    return await this.hardwareService.deleteAllUsers(instituicaoCodigo, equipmentId);
  }

  @Post(':equipmentId/command')
  @RequirePermission('equipamento', 'update')
  async command(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('equipmentId', ParseIntPipe) equipmentId: number,
    @Body() body: { command: string; params?: any; targetIp?: string },
  ) {
    this.logger.log(
      `[${instituicaoCodigo}] Executing command ${body.command} on device ${equipmentId} ${body.targetIp ? `(IP: ${body.targetIp})` : ''}`,
    );
    return await this.hardwareService.executeCommand(
      equipmentId,
      body.command,
      body.params,
      body.targetIp,
    );
  }

  @Post('test-connection')
  @RequirePermission('equipamento', 'update')
  async testConnection(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: TestConnectionDto,
  ) {
    this.logger.log(
      `[${instituicaoCodigo}] Test connection to ${dto.EQPMarca}/${dto.EQPModelo ?? '-'} @ ${dto.ip}`,
    );
    return this.hardwareService.testConnection({
      INSInstituicaoCodigo: instituicaoCodigo,
      EQPMarca: dto.EQPMarca,
      EQPModelo: dto.EQPModelo ?? null,
      EQPUsaAddon: dto.EQPUsaAddon,
      EQPConfig: dto.EQPConfig,
      ip: dto.ip,
    });
  }
}
