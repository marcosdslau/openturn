import { Injectable } from '@nestjs/common';

export type DeployEnvironmentDto = {
  code: 'DEV' | 'PRD';
  label: string;
};

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  /** Devolve o ambiente de deploy (NODE_ENV ou APP_DEPLOY_ENV no .env). */
  getDeployEnvironment(): DeployEnvironmentDto {
    const raw = (process.env.APP_DEPLOY_ENV ?? process.env.NODE_ENV ?? 'DEV')
      .toString()
      .trim()
      .toUpperCase();
    if (raw === 'PRD' || raw === 'PRODUCTION') {
      return { code: 'PRD', label: 'Produção' };
    }
    return { code: 'DEV', label: 'Desenvolvimento' };
  }
}
