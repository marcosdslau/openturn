/**
 * DB Tenant Proxy
 * 
 * Este proxy intercepta todas as chamadas ao Prisma Client e injeta
 * automaticamente o filtro de INSInstituicaoCodigo, garantindo isolamento
 * de dados por tenant (RLS - Row Level Security).
 */

export class DbTenantProxy {
    private instituicaoCodigo: number;

    constructor(private prisma: any, instituicaoCodigo: number) {
        this.instituicaoCodigo = instituicaoCodigo;
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

                    // Métodos que precisam de filtro WHERE
                    if (['findMany', 'findFirst', 'findUnique', 'count', 'delete', 'deleteMany', 'update', 'updateMany'].includes(prop)) {
                        const enhancedParams = {
                            ...params,
                            where: {
                                ...params?.where,
                                INSInstituicaoCodigo: this.instituicaoCodigo,
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
                                INSInstituicaoCodigo: this.instituicaoCodigo,
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
                                    INSInstituicaoCodigo: this.instituicaoCodigo,
                                }))
                                : {
                                    ...params?.data,
                                    INSInstituicaoCodigo: this.instituicaoCodigo,
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
