export class DbTenantProxy {
    private instituicaoCodigo: number;

    constructor(private prisma: any, instituicaoCodigo: number) {
        this.instituicaoCodigo = instituicaoCodigo;
    }

    /** INSInstituicao usa INSCodigo como PK; demais modelos usam INSInstituicaoCodigo. */
    private tenantWhere(modelName: string): Record<string, number> {
        return modelName === 'iNSInstituicao'
            ? { INSCodigo: this.instituicaoCodigo }
            : { INSInstituicaoCodigo: this.instituicaoCodigo };
    }

    /** Campo de tenant para injeção em create/createMany (exceto INSInstituicao). */
    private tenantData(modelName: string): Record<string, number> {
        return modelName === 'iNSInstituicao'
            ? {}
            : { INSInstituicaoCodigo: this.instituicaoCodigo };
    }

    createModelProxy(modelName: string) {
        const model = this.prisma[modelName];

        return new Proxy(model, {
            get: (target: any, prop: string) => {
                if (typeof target[prop] !== 'function') {
                    return target[prop];
                }

                return (...args: any[]) => {
                    const [params] = args;

                    // WhereUniqueInput: injeta via AND para não conflitar com @id/@unique
                    if (['delete', 'update', 'findUnique'].includes(prop)) {
                        return target[prop]({
                            ...params,
                            where: {
                                ...params?.where,
                                AND: [
                                    ...(params?.where?.AND ? (Array.isArray(params.where.AND) ? params.where.AND : [params.where.AND]) : []),
                                    this.tenantWhere(modelName),
                                ],
                            },
                        });
                    }

                    // WhereInput genérico: pode adicionar campo diretamente
                    if (['findMany', 'findFirst', 'count', 'deleteMany', 'updateMany'].includes(prop)) {
                        return target[prop]({
                            ...params,
                            where: { ...params?.where, ...this.tenantWhere(modelName) },
                        });
                    }

                    if (prop === 'create') {
                        return target[prop]({
                            ...params,
                            data: { ...params?.data, ...this.tenantData(modelName) },
                        });
                    }

                    if (prop === 'createMany') {
                        return target[prop]({
                            ...params,
                            data: Array.isArray(params?.data)
                                ? params.data.map((item: any) => ({ ...item, ...this.tenantData(modelName) }))
                                : { ...params?.data, ...this.tenantData(modelName) },
                        });
                    }

                    return target[prop](...args);
                };
            },
        });
    }

    createDbContext(allowedModels: string[]) {
        const dbContext: any = {};
        for (const modelName of allowedModels) {
            const key = modelName.charAt(0).toUpperCase() + modelName.slice(1);
            dbContext[key] = this.createModelProxy(modelName);
        }
        return dbContext;
    }
}
