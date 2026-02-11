import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantService } from '../tenant/tenant.service';

const GLOBAL_ROLES = ['SUPER_ROOT', 'SUPER_ADMIN'];

@Injectable()
export class TenantInterceptor implements NestInterceptor {
    constructor(private tenantService: TenantService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // Global roles bypass tenant filtering
        if (user?.acessos?.some((a: any) => GLOBAL_ROLES.includes(a.grupo))) {
            const tenantIdStr = request.params.codigoInstituicao || request.headers['x-tenant-id'];
            if (tenantIdStr) {
                const tenantId = parseInt(tenantIdStr, 10);
                if (!isNaN(tenantId)) {
                    this.tenantService.setTenantId(tenantId);
                }
            }
            return next.handle();
        }

        // Scoped users: capture tenant from route/header
        const tenantIdStr = request.params.codigoInstituicao || request.headers['x-tenant-id'];

        if (tenantIdStr) {
            const tenantId = parseInt(tenantIdStr, 10);
            if (!isNaN(tenantId)) {
                this.tenantService.setTenantId(tenantId);
            }
        }

        return next.handle();
    }
}
