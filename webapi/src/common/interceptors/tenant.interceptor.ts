import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
    constructor(private tenantService: TenantService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();

        // Captura o codigoInstituicao da rota ou do header
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
