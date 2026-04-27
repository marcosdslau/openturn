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
                const results = await (baseClient as any).$transaction([
                  (baseClient as any).$executeRawUnsafe(
                    `SET app.current_tenant = '${tenantId}'`,
                  ),
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
