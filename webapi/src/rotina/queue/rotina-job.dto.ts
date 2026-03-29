export const ROTINA_QUEUE_NAME = 'rotina-execute';

export interface RotinaJobData {
    exeId: string;
    rotinaCodigo: number;
    instituicaoCodigo: number;
    trigger: 'SCHEDULE' | 'WEBHOOK';
    requestEnvelope?: any;
    enqueuedAt: string;
}
