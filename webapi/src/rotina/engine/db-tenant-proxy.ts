/**
 * DB Tenant Proxy
 *
 * Este proxy intercepta todas as chamadas ao Prisma Client e injeta
 * automaticamente o filtro de INSInstituicaoCodigo, garantindo isolamento
 * de dados por tenant (RLS - Row Level Security).
 */

export class DbTenantProxy {
  private instituicaoCodigo: number;

  constructor(
    private prisma: any,
    instituicaoCodigo: number,
  ) {
    this.instituicaoCodigo = instituicaoCodigo;
  }

  /**
   * Modelos sem coluna própria de tenant: o isolamento sai por relação.
   * Injetar `INSInstituicaoCodigo` neles quebra a query (campo inexistente no Prisma).
   */
  private static readonly TENANT_BY_RELATION: Record<string, string> = {
    pESEquipamentoMapeamento: 'pessoa',
  };

  /** INSInstituicao usa INSCodigo como PK; demais modelos usam INSInstituicaoCodigo (ou uma relação). */
  private tenantWhere(modelName: string): Record<string, unknown> {
    if (modelName === 'iNSInstituicao') {
      return { INSCodigo: this.instituicaoCodigo };
    }

    const relacao = DbTenantProxy.TENANT_BY_RELATION[modelName];
    if (relacao) {
      return { [relacao]: { INSInstituicaoCodigo: this.instituicaoCodigo } };
    }

    return { INSInstituicaoCodigo: this.instituicaoCodigo };
  }

  /**
   * Campo de tenant para injeção em create/createMany.
   * Vazio para INSInstituicao (é o próprio tenant) e para modelos escopados por relação,
   * que herdam a instituição da linha pai.
   */
  private tenantData(modelName: string): Record<string, number> {
    return modelName === 'iNSInstituicao' ||
      DbTenantProxy.TENANT_BY_RELATION[modelName]
      ? {}
      : { INSInstituicaoCodigo: this.instituicaoCodigo };
  }

  /** Injeta o filtro de tenant em um WhereUniqueInput sem conflitar com @id/@unique. */
  private mergeWhereUnique(
    modelName: string,
    where: any,
  ): Record<string, unknown> {
    const existente = where?.AND
      ? Array.isArray(where.AND)
        ? where.AND
        : [where.AND]
      : [];

    return {
      ...where,
      AND: [...existente, this.tenantWhere(modelName)],
    };
  }

  /**
   * Cria um proxy para um modelo específico do Prisma
   */
  createModelProxy(modelName: string) {
    const model = this.prisma[modelName];

    return new Proxy(model, {
      get: (target, prop: string) => {
        // Se não for uma função, retorna o valor original
        if (typeof target[prop] !== 'function') {
          return target[prop];
        }

        // Intercepta métodos de query
        return (...args: any[]) => {
          const [params] = args;

          // Métodos que usam WhereUniqueInput (apenas @id/@unique permitidos no where)
          // Injeta INSInstituicaoCodigo via AND para garantir tenant isolation
          if (
            ['delete', 'update', 'findUnique', 'findUniqueOrThrow'].includes(
              prop,
            )
          ) {
            const enhancedParams = {
              ...params,
              where: this.mergeWhereUnique(modelName, params?.where),
            };
            return target[prop](enhancedParams);
          }

          // Métodos que aceitam where genérico (WhereInput)
          if (
            [
              'findMany',
              'findFirst',
              'findFirstOrThrow',
              'count',
              'aggregate',
              'groupBy',
              'deleteMany',
              'updateMany',
            ].includes(prop)
          ) {
            const enhancedParams = {
              ...params,
              where: {
                ...params?.where,
                ...this.tenantWhere(modelName),
              },
            };
            return target[prop](enhancedParams);
          }

          // UPSERT - escopo no where e tenant na linha criada.
          // O `update` interno herda o escopo do próprio where.
          if (prop === 'upsert') {
            const enhancedParams = {
              ...params,
              where: this.mergeWhereUnique(modelName, params?.where),
              create: {
                ...params?.create,
                ...this.tenantData(modelName),
              },
            };
            return target[prop](enhancedParams);
          }

          // Método CREATE - injeta no data
          if (prop === 'create') {
            const enhancedParams = {
              ...params,
              data: {
                ...params?.data,
                ...this.tenantData(modelName),
              },
            };
            return target[prop](enhancedParams);
          }

          // Método CREATE MANY - injeta em cada item
          if (prop === 'createMany') {
            const enhancedParams = {
              ...params,
              data: Array.isArray(params?.data)
                ? params.data.map((item: any) => ({
                    ...item,
                    ...this.tenantData(modelName),
                  }))
                : {
                    ...params?.data,
                    ...this.tenantData(modelName),
                  },
            };
            return target[prop](enhancedParams);
          }

          // Para outros métodos, executa normalmente
          return target[prop](...args);
        };
      },
    });
  }

  /**
   * Cria o objeto context.db com proxies para os modelos permitidos
   */
  createDbContext(allowedModels: string[]) {
    const dbContext: any = {};

    for (const modelName of allowedModels) {
      // Converte nome do modelo para PascalCase (ex: pESPessoa -> PESPessoa)
      // Isso garante que o script use o nome REAL do modelo definido no schema.prisma
      // O modelName de entrada já é a propriedade do prisma (ex: pESPessoa)
      const key = modelName.charAt(0).toUpperCase() + modelName.slice(1);
      dbContext[key] = this.createModelProxy(modelName);

      // Opcional: Manter retrocompatibilidade com camelCase se necessário,
      // mas o usuário pediu para usar o nome REAL.
      // dbContext[modelName] = dbContext[key];
    }

    return dbContext;
  }
}
