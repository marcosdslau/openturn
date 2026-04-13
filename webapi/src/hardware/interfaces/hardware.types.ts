
export enum HardwareBrand {
    CONTROLID = 'ControlID',
    HIKVISION = 'Hikvision',
    TOPDATA = 'TopData',
    INTELBRAS = 'Intelbras',
}

// ... (existing ControlIDMode and ControlIDConfig)

export enum ControlIDMode {
    STANDALONE = 'standalone',
    ONLINE_PRO = 'pro',
    ONLINE_ENTERPRISE = 'enterprise',
}

/** Sentido de entrada no cadastro (agnóstico de fabricante). Mapeamento para eventos do hardware fica por marca/modelo. */
export type EntrySide = 'left' | 'right';

/** Campo do equipamento que casou com `device_id` do webhook ControlID Monitor. */
export type ControlidDeviceMatchField =
    | 'EQPDeviceId'
    | 'EQPConfig.deviceId'
    | 'EQPConfig.deviceId_entry'
    | 'EQPConfig.deviceId_exit'
    | 'EQPConfig.onlineServerId'
    | 'legacy_EQPCodigo';

export interface ControlIDConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
    mode: ControlIDMode;
    model?: string; // e.g., 'iDBlock', 'iDAccess'
    rotation_type?: 'both_controlled' | 'entry_free_exit_controlled' | 'entry_controlled_exit_free' | 'both_free';
    /**
     * Sentido físico de entrada configurado na instalação (Direita/Esquerda).
     * Preferido em relação a `entry_direction` para novos cadastros.
     */
    entry_side?: EntrySide;
    /**
     * Se true, ENTRADA/SAÍDA no Monitor é derivado comparando o giro com `entry_side` (via mapper ControlID).
     * Se false, usa a convenção nativa do equipamento (ex.: ControlID 7 = entrada, 8 = saída).
     */
    entry_direction_applied_by_equipment?: boolean;
    /** Legado / detalhe ControlID; pode ser derivado de `entry_side` ao salvar no painel. */
    entry_direction?: 'clockwise' | 'counter_clockwise';
    anti_double_entry?: 'active' | 'inactive';
    door_id?: number | string;
    /** @deprecated Prefira `deviceId` (mesmo significado que o device_id do Monitor no host principal). */
    onlineServerId?: string;
    /** device_id do Monitor ControlID associado ao host / equipamento principal (IP em EQPEnderecoIp ou `host`). */
    deviceId?: string;
    ip_entry?: string; // IP for entry facial reader
    /** device_id do Monitor no leitor de entrada (par de `ip_entry`). */
    deviceId_entry?: string;
    ip_exit?: string; // IP for exit facial reader
    /** device_id do Monitor no leitor de saída (par de `ip_exit`). */
    deviceId_exit?: string;
}

export interface HardwareUser {
    id: number;
    name: string;
    password?: string;
    cpf?: string;
    limiar?: number;
    tags?: string[]; // Cards/Tags
    faces?: string[]; // Base64 faces
    faceExtension?: string;
    fingers?: string[]; // Base64 templates
    // ... other fields as needed
}

export interface IHardwareProvider {
    /**
     * Syncs a person with the physical device (Full sync users, cards, biometrics)
     */
    syncPerson(equipmentId: number, person: HardwareUser): Promise<{ idNoEquipamento: string }>;

    /**
     * Granular methods for specific routine operations
     */
    createPerson(equipmentId: number, id: number, name: string, password?: string, cpf?: string, limiar?: number): Promise<void>;
    modifyPerson(equipmentId: number, id: number, name: string, password?: string, cpf?: string, limiar?: number): Promise<void>;
    deletePerson(id: number): Promise<void>;

    setTag(userId: number, tag: string): Promise<void>;
    removeTag(tag: string): Promise<void>;

    setFace(userId: number, faceBase64: string, extension: string): Promise<void>;
    removeFace(userId: number): Promise<void>;

    setFingers(userId: number, templates: string[]): Promise<void>;
    removeFingers(userId: number): Promise<void>;

    setGroups(userId: number, groupIds: (number | string)[]): Promise<void>;
    removeGroups(userId: number, groupIds: (number | string)[]): Promise<void>;

    /**
     * Commands the device to perform an action (e.g., open door/turnstile)
     */
    executeAction(action: string, params?: any): Promise<void>;

    /**
     * Sets the device to enrollment mode (Remote capture)
     */
    enroll(type: 'face' | 'biometry', userId: number): Promise<void>;

    /**
     * Executes a custom command on the device (manufacturer specific)
     */
    customCommand(cmd: string, params?: any): Promise<any>;
}
