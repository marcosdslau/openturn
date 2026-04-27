import { Injectable } from '@nestjs/common';
import { EQPEquipamento, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { HardwareBrand } from '../../../interfaces/hardware.types';
import { ControlidDeviceMatchField } from '../controlid.types';

@Injectable()
export class ControlidResolverService {
  private static readonly INT32_MIN = -2147483648;
  private static readonly INT32_MAX = 2147483647;

  constructor(private readonly prisma: PrismaService) {}

  private ctlStr(v: unknown): string | undefined {
    if (v === undefined || v === null) return undefined;
    return String(v);
  }

  /**
   * Resolve a instituição a partir do device_id do webhook ControlID.
   */
  async resolveInstituicaoCodigoFromControlidDeviceId(
    deviceId: unknown,
  ): Promise<number | null> {
    const s = this.ctlStr(deviceId);
    if (s === undefined || s === '') return null;

    const byColumn = await this.prisma.eQPEquipamento.findFirst({
      where: { deviceId: s },
      select: { INSInstituicaoCodigo: true },
    });
    if (byColumn) return byColumn.INSInstituicaoCodigo;

    const rows = await this.prisma.$queryRaw<
      { INSInstituicaoCodigo: number }[]
    >(
      Prisma.sql`
                SELECT e."INSInstituicaoCodigo"
                FROM "EQPEquipamento" e
                WHERE e."EQPMarca" = ${HardwareBrand.CONTROLID}
                  AND e."EQPConfig" IS NOT NULL
                  AND (
                    e."EQPConfig"->>'deviceId' = ${s}
                    OR e."EQPConfig"->>'deviceId_entry' = ${s}
                    OR e."EQPConfig"->>'deviceId_exit' = ${s}
                    OR e."EQPConfig"->>'onlineServerId' = ${s}
                  )
                LIMIT 1
            `,
    );
    if (rows[0]?.INSInstituicaoCodigo != null)
      return rows[0].INSInstituicaoCodigo;

    if (/^-?\d+$/.test(s)) {
      try {
        const bi = BigInt(s);
        if (
          bi >= BigInt(ControlidResolverService.INT32_MIN) &&
          bi <= BigInt(ControlidResolverService.INT32_MAX)
        ) {
          const eq = await this.prisma.eQPEquipamento.findFirst({
            where: { EQPCodigo: Number(bi) },
            select: { INSInstituicaoCodigo: true },
          });
          if (eq) return eq.INSInstituicaoCodigo;
        }
      } catch {
        /* não é inteiro válido para BigInt */
      }
    }

    return null;
  }

  /**
   * Resolve o equipamento ControlID e o campo que casou com `device_id` do webhook Monitor.
   */
  async resolveEquipamentoFromControlidDeviceId(deviceId: unknown): Promise<{
    equipamento: EQPEquipamento;
    matchedField: ControlidDeviceMatchField;
  } | null> {
    const s = this.ctlStr(deviceId);
    if (s === undefined || s === '') return null;

    const byColumn = await this.prisma.eQPEquipamento.findFirst({
      where: { deviceId: s },
    });
    if (byColumn) {
      return { equipamento: byColumn, matchedField: 'EQPDeviceId' };
    }

    const cfgRows = await this.prisma.$queryRaw<
      { EQPCodigo: number; matchedField: string }[]
    >(
      Prisma.sql`
                SELECT e."EQPCodigo",
                  CASE
                    WHEN e."EQPConfig"->>'deviceId' = ${s} THEN 'EQPConfig.deviceId'
                    WHEN e."EQPConfig"->>'deviceId_entry' = ${s} THEN 'EQPConfig.deviceId_entry'
                    WHEN e."EQPConfig"->>'deviceId_exit' = ${s} THEN 'EQPConfig.deviceId_exit'
                    WHEN e."EQPConfig"->>'onlineServerId' = ${s} THEN 'EQPConfig.onlineServerId'
                  END AS "matchedField"
                FROM "EQPEquipamento" e
                WHERE e."EQPMarca" = ${HardwareBrand.CONTROLID}
                  AND e."EQPConfig" IS NOT NULL
                  AND (
                    e."EQPConfig"->>'deviceId' = ${s}
                    OR e."EQPConfig"->>'deviceId_entry' = ${s}
                    OR e."EQPConfig"->>'deviceId_exit' = ${s}
                    OR e."EQPConfig"->>'onlineServerId' = ${s}
                  )
                LIMIT 1
            `,
    );
    const cfgHit = cfgRows[0];
    if (cfgHit?.EQPCodigo != null && cfgHit.matchedField) {
      const equipamento = await this.prisma.eQPEquipamento.findUnique({
        where: { EQPCodigo: cfgHit.EQPCodigo },
      });
      if (equipamento) {
        return {
          equipamento,
          matchedField: cfgHit.matchedField as ControlidDeviceMatchField,
        };
      }
    }

    if (/^-?\d+$/.test(s)) {
      try {
        const bi = BigInt(s);
        if (
          bi >= BigInt(ControlidResolverService.INT32_MIN) &&
          bi <= BigInt(ControlidResolverService.INT32_MAX)
        ) {
          const eq = await this.prisma.eQPEquipamento.findFirst({
            where: { EQPCodigo: Number(bi) },
          });
          if (eq) {
            return { equipamento: eq, matchedField: 'legacy_EQPCodigo' };
          }
        }
      } catch {
        /* não é inteiro válido para BigInt */
      }
    }

    return null;
  }
}
