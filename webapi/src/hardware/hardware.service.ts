
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EQPEquipamento } from '@prisma/client';
import { IHardwareProvider, ControlIDConfig, HardwareBrand } from './interfaces/hardware.types';
import { ControlIDProvider } from './providers/controlid.provider';

@Injectable()
export class HardwareService {
    private readonly logger = new Logger(HardwareService.name);

    constructor(private readonly prisma: PrismaService) { }

    instantiate(equipment: EQPEquipamento, overrideHost?: string): IHardwareProvider {
        if (equipment.EQPMarca === HardwareBrand.CONTROLID) {
            // Parse config safely
            const config = equipment.EQPConfig as unknown as ControlIDConfig;

            // Determine effective host with fallbacks
            const host = overrideHost
                || config?.host
                || config?.ip_entry
                || config?.ip_exit
                || equipment.EQPEnderecoIp;

            if (!host) {
                throw new Error(`Invalid configuration for equipment ${equipment.EQPCodigo}: No valid host/IP found.`);
            }

            // Create a config copy with the effective host
            const effectiveConfig: ControlIDConfig = {
                ...(config || {} as ControlIDConfig),
                host,
                model: equipment.EQPModelo || undefined // Inject model from equipment
            };

            return new ControlIDProvider(effectiveConfig);
        }

        throw new Error(`Unsupported hardware brand: ${equipment.EQPMarca}`);
    }

    async syncAll(instituicaoId: number) {
        // Implementation to sync all users to all devices of an institution
        // Fetch all devices
        const devices = await this.prisma.eQPEquipamento.findMany({
            where: { INSInstituicaoCodigo: instituicaoId, EQPAtivo: true }
        });

        // Fetch all active people with their credentials
        const people = await this.prisma.pESPessoa.findMany({
            where: { INSInstituicaoCodigo: instituicaoId, PESAtivo: true },
            // include photos? PESFotoBase64 is loaded.
        });

        for (const dev of devices) {
            try {
                const provider = this.instantiate(dev);
                for (const person of people) {
                    let fingers: string[] = [];
                    if (person.PESTemplates && Array.isArray(person.PESTemplates)) {
                        fingers = person.PESTemplates as string[];
                    }

                    await provider.syncPerson({
                        id: person.PESCodigo,
                        name: person.PESNome,
                        tags: person.PESCartaoTag ? [person.PESCartaoTag] : [],
                        faces: person.PESFotoBase64 ? [person.PESFotoBase64] : [],
                        fingers: fingers,
                    });
                }
            } catch (e) {
                this.logger.error(`Failed to sync device ${dev.EQPCodigo}`, e);
            }
        }
    }
    async executeCommand(equipmentId: number, command: string, params?: any, targetIp?: string): Promise<any> {
        const device = await this.prisma.eQPEquipamento.findUnique({
            where: { EQPCodigo: equipmentId }
        });

        if (!device) {
            throw new Error(`Equipment ${equipmentId} not found`);
        }

        // Validate targetIp if provided
        if (targetIp) {
            const config = device.EQPConfig as unknown as ControlIDConfig;
            const allowedIps = [
                device.EQPEnderecoIp,
                config?.host,
                config?.ip_entry,
                config?.ip_exit
            ].filter(ip => !!ip); // filter undefined/null/empty

            if (!allowedIps.includes(targetIp)) {
                throw new Error(`Invalid target IP ${targetIp} for device ${equipmentId}`);
            }
        }

        const provider = this.instantiate(device, targetIp);
        return await provider.customCommand(command, params);
    }

    async processAccessLog(instituicaoId: number, event: any) {
        // event structure example:
        // { time: 167..., event: 7, user_id: 100, portal_id: 1, ... }
        // We need to map this to REGRegistroPassagem
        try {
            const timestamp = event.time;
            const userId = event.user_id;

            // Log raw event for debugging
            this.logger.debug(`Processing access log: User ${userId} at ${timestamp}`);

            // Find device by IP? Or just use institution context
            // In Push mode, how do we know which device sent it? 
            // Usually we check request IP or we can try to trust the push if authenticated.
            // For now, let's assume we can map user.

            // Insert into REGRegistroPassagem
            // We need PESPessoa.PESCodigo from user_id? 
            // Assuming user_id matches PESCodigo as we synced it that way.

            const person = await this.prisma.pESPessoa.findUnique({
                where: { PESCodigo: userId }
            });

            if (!person) {
                this.logger.warn(`User ${userId} not found in database. Skipping log.`);
                return;
            }

            // We need a device ID (EQPCodigo). 
            // In a real monitor implementation, we should identify the source device.
            // For now, getting the first active device of the institution or null?
            // Schema requires EQPCodigo.
            // TODO: Enhance MonitorController to identify device (e.g. by IP or serial in headers)
            // Let's assume for now we use a placeholder or look up by logic. 
            // Just picking the first device for this MVP implementation of the log.
            const device = await this.prisma.eQPEquipamento.findFirst({
                where: { INSInstituicaoCodigo: instituicaoId }
            });

            if (!device) {
                this.logger.warn(`No device found for institution ${instituicaoId}. Cannot log access.`);
                return;
            }

            await this.prisma.rEGRegistroPassagem.create({
                data: {
                    PESCodigo: person.PESCodigo,
                    EQPCodigo: device.EQPCodigo,
                    REGAcao: 'ENTRADA', // Determine based on portal_id or direction if available
                    REGTimestamp: BigInt(timestamp),
                    REGDataHora: new Date(timestamp * 1000),
                    INSInstituicaoCodigo: instituicaoId
                }
            });

            this.logger.log(`Access logged for person ${person.PESNome}`);

        } catch (error) {
            this.logger.error(`Failed to process access log`, error);
        }
    }
}
