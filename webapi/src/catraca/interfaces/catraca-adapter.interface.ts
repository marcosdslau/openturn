export interface ICatracaAdapter {
    /**
     * Envia comando para abrir o portão/relê
     */
    openGate(deviceId: string): Promise<any>;

    /**
     * Envia ou atualiza um usuário no equipamento
     */
    syncUser(deviceId: string, user: any): Promise<any>;

    /**
     * Remove um usuário do equipamento
     */
    deleteUser(deviceId: string, userId: string): Promise<any>;

    /**
     * Busca logs de eventos no equipamento
     */
    getLogs(deviceId: string): Promise<any[]>;
}
