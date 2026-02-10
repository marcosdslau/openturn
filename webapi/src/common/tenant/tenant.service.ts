import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class TenantService {
    private static readonly als = new AsyncLocalStorage<number>();

    setTenantId(tenantId: number) {
        TenantService.als.enterWith(tenantId);
    }

    getTenantId(): number | undefined {
        return TenantService.als.getStore();
    }

    runWithTenant(tenantId: number, callback: () => any) {
        return TenantService.als.run(tenantId, callback);
    }
}
