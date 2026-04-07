export class DbTenantProxy {
    private instituicaoCodigo: number;

    constructor(private prisma: any, instituicaoCodigo: number) {
        this.instituicaoCodigo = instituicaoCodigo;
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
                                    { INSInstituicaoCodigo: this.instituicaoCodigo },
                                ],
                            },
                        });
                    }

                    // WhereInput genérico: pode adicionar campo diretamente
                    if (['findMany', 'findFirst', 'count', 'deleteMany', 'updateMany'].includes(prop)) {
                        return target[prop]({
                            ...params,
                            where: { ...params?.where, INSInstituicaoCodigo: this.instituicaoCodigo },
                        });
                    }

                    if (prop === 'create') {
                        return target[prop]({
                            ...params,
                            data: { ...params?.data, INSInstituicaoCodigo: this.instituicaoCodigo },
                        });
                    }

                    if (prop === 'createMany') {
                        return target[prop]({
                            ...params,
                            data: Array.isArray(params?.data)
                                ? params.data.map((item: any) => ({ ...item, INSInstituicaoCodigo: this.instituicaoCodigo }))
                                : { ...params?.data, INSInstituicaoCodigo: this.instituicaoCodigo },
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
