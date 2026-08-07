import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private _rlsClient: any;

  constructor(private tenantService: TenantService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  get rls() {
    if (!this._rlsClient) {
      const tenantService = this.tenantService;
      const baseClient = this;

      this._rlsClient = this.$extends({
        query: {
          $allModels: {
            async $allOperations({ args, query }) {
              const tenantId = tenantService.getTenantId();
              if (tenantId) {
                // set_config(..., true) com $executeRaw parametrizado evita concatenar o
                // valor na string SQL (risco de injeção) e é o padrão recomendado para
                // GUCs por sessão de transação — SET LOCAL não aceita bind de parâmetro.
                const results = await (baseClient as any).$transaction([
                  (baseClient as any).$executeRaw`SELECT set_config('app.current_tenant', ${String(tenantId)}, true)`,
                  query(args),
                ]);
                return results[1];
              }
              return query(args);
            },
          },
        },
      });
    }
    return this._rlsClient;
  }
}
