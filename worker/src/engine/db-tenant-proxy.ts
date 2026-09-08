export class DbTenantProxy {
    private instituicaoCodigo: number;

    constructor(private prisma: any, instituicaoCodigo: number) {
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
    private mergeWhereUnique(modelName: string, where: any): Record<string, unknown> {
        const existente = where?.AND
            ? (Array.isArray(where.AND) ? where.AND : [where.AND])
            : [];

        return {
            ...where,
            AND: [...existente, this.tenantWhere(modelName)],
        };
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
                    if (['delete', 'update', 'findUnique', 'findUniqueOrThrow'].includes(prop)) {
                        return target[prop]({
                            ...params,
                            where: this.mergeWhereUnique(modelName, params?.where),
                        });
                    }

                    // WhereInput genérico: pode adicionar campo diretamente
                    if (['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'deleteMany', 'updateMany'].includes(prop)) {
                        return target[prop]({
                            ...params,
                            where: { ...params?.where, ...this.tenantWhere(modelName) },
                        });
                    }

                    // upsert: escopo no where e tenant na linha criada.
                    // O `update` interno herda o escopo do próprio where.
                    if (prop === 'upsert') {
                        return target[prop]({
                            ...params,
                            where: this.mergeWhereUnique(modelName, params?.where),
                            create: { ...params?.create, ...this.tenantData(modelName) },
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
