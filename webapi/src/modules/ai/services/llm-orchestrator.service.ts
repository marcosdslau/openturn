import { Injectable, BadRequestException } from '@nestjs/common';
import { OpenAiAdapter } from '../providers/openai.adapter';
import { ILlmProviderAdapter, ChatMessageRequest } from '../providers/LlmProvider.interface';
import { AiUsageService } from './ai-usage.service';
import { AiPermissionService } from './ai-permission.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class LlmOrchestratorService {
    private providers: Map<string, ILlmProviderAdapter> = new Map();

    constructor(
        private openaiAdapter: OpenAiAdapter,
        private usageService: AiUsageService,
        private permissionService: AiPermissionService,
        private prisma: PrismaService
    ) {
        // Register available providers
        // Open/Closed principle: new providers like Anthropic can simply be injected and added to this map.
        this.providers.set(this.openaiAdapter.providerCode, this.openaiAdapter);
    }

    async predictStream(
        instituicaoCodigo: number,
        userCodigo: number,
        modelCodigo: number,
        messages: ChatMessageRequest[],
        onChunk: (chunk: any) => void,
        onFinish?: (assistantFullReply: string, usage: any) => void
    ) {
        // 1. Gating & Limits validate
        const { allowed, limitDia } = await this.permissionService.validateAccess(instituicaoCodigo, userCodigo, modelCodigo);
        if (!allowed) throw new BadRequestException('Acesso negado para este modelo na instituição atual.');

        const usageToday = await this.usageService.getDailyTokensUsed(instituicaoCodigo, userCodigo);
        if (usageToday >= limitDia) {
            throw new BadRequestException(`Limite diário de tokens excedido (${limitDia}). Consumo atual: ${usageToday}.`);
        }

        // 2. Resolve Model and corresponding Provider Layer
        const modelDef = await this.prisma.aIMModeloIa.findUnique({
            where: { AIMCodigo: modelCodigo },
            include: { provedor: true }
        });

        if (!modelDef || !modelDef.AIMAtivo || !modelDef.provedor.AIPAtivo) {
            throw new BadRequestException('Modelo ou provedor inativo/inválido.');
        }

        const providerKey = modelDef.provedor.AIPNome.toUpperCase().includes('OPENAI') ? 'OPENAI' : modelDef.provedor.AIPNome.toUpperCase();
        const provider = this.providers.get(providerKey);
        if (!provider) {
            throw new BadRequestException(`Provider adapter não encontrado para: ${modelDef.provedor.AIPNome}`);
        }

        // 3. System Context Injection
        // Strict scoping the AI as a Javascript coding assistant for OpenTurn.
        const sysPrompt = `Você é o assistente de inteligência artificial embarcado no editor de rotinas de integração do sistema OpenTurn. Seu papel principal é auxiliar desenvolvedores descrevendo lógicas em Javascript (Node.js/ES6). Traga exemplos técnicos limpos. O código criado e executado não deve utilizar modules imports que não sejam built-in do node ou que demandem \`require\` inseguro, utilize exports e object returns compatíveis com o formato (module.exports = async function(ctx) { ... }). Seja conciso, responda em Português-BR.`;

        // 4. Stream Pipeline
        let assistantFullOutput = '';
        await provider.predictStream(
            modelDef.AIMProviderModelId,
            sysPrompt,
            messages,
            (chunk) => {
                if (chunk.chunkText) {
                    assistantFullOutput += chunk.chunkText;
                }

                onChunk(chunk);

                // Usage is transmitted usually on the last chunk
                if (chunk.isDone && chunk.usage) {
                    // Compute estimated cost based on ledger pricing rule
                    const costUsd = (chunk.usage.inputTokens / 1000 * modelDef.AIMCustoInput1k)
                        + (chunk.usage.outputTokens / 1000 * modelDef.AIMCustoOutput1k);

                    chunk.usage.costUsd = costUsd;

                    // Asynchronously perform Ledger persistence. Error swallowing handles transient DB drops gracefully.
                    this.usageService.logConversationUsage(
                        instituicaoCodigo,
                        userCodigo,
                        modelCodigo,
                        chunk.usage
                    ).catch(e => console.error('Error logging usage billing:', e));

                    if (onFinish) onFinish(assistantFullOutput, chunk.usage);
                }
            }
        );
    }
}
