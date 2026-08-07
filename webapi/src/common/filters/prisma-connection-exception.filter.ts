import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * Códigos do Prisma que indicam indisponibilidade de infraestrutura (pool esgotado, banco
 * inalcançável, conexão fechada pelo servidor) em vez de um erro de negócio/validação.
 * Referência: https://www.prisma.io/docs/orm/reference/error-reference
 */
const CONNECTION_ERROR_CODES = new Set([
  'P1001', // Can't reach database server
  'P1002', // Database server reached but timed out
  'P1008', // Operations timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching a new connection from the connection pool
]);

/**
 * Intercepta erros de conexão/pool do Prisma e responde 503 (com Retry-After) em vez de
 * deixá-los cair no 500 genérico do Nest. Isso dá ao frontend um sinal inequívoco de
 * "instabilidade temporária do backend" — distinto de um 401 (sessão inválida) ou de um
 * erro de negócio — evitando que uma instabilidade passageira do banco seja interpretada
 * como falha de autenticação. Qualquer outro erro é repassado ao filtro padrão do Nest.
 */
@Catch()
export class PrismaConnectionExceptionFilter extends BaseExceptionFilter {
  private readonly filterLogger = new Logger(PrismaConnectionExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (!this.isConnectionIssue(exception)) {
      super.catch(exception, host);
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const err = exception as Error & { code?: string };

    this.filterLogger.error(
      `Banco de dados indisponível (${err.code ?? err.name}) em ${request?.method} ${request?.url}: ${err.message}`,
    );

    response.setHeader('Retry-After', '5');
    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message:
        'Serviço temporariamente indisponível (banco de dados sob instabilidade). Tente novamente em instantes.',
      error: 'Service Unavailable',
    });
  }

  private isConnectionIssue(exception: unknown): boolean {
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return true;
    }
    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      CONNECTION_ERROR_CODES.has(exception.code)
    ) {
      return true;
    }
    return false;
  }
}
