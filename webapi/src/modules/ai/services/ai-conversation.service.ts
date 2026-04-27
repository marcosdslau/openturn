import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AICConversaIa, AIMSMensagemIa } from '@prisma/client';

@Injectable()
export class AiConversationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Lista todas as conversas/threads de uma rotina para um usuário
   */
  async getUserRoutineConversations(
    instituicaoCodigo: number,
    userCodigo: number,
    rotinaCodigo: number,
  ): Promise<AICConversaIa[]> {
    return await this.prisma.aICConversaIa.findMany({
      where: {
        INSInstituicaoCodigo: instituicaoCodigo,
        USRCodigo: userCodigo,
        ROTCodigo: rotinaCodigo,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca uma conversa específica pelo ID
   */
  async getConversationById(
    instituicaoCodigo: number,
    conversaCodigo: number,
  ): Promise<AICConversaIa> {
    const conversa = await this.prisma.aICConversaIa.findFirst({
      where: {
        AICCodigo: conversaCodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
        deletedAt: null,
      },
    });

    if (!conversa) throw new NotFoundException('Conversa não encontrada');
    return conversa;
  }

  /**
   * Cria uma nova conversa (Thread) para a rotina
   */
  async createRoutineConversation(
    instituicaoCodigo: number,
    userCodigo: number,
    modelCodigo: number,
    rotinaCodigo: number,
    titulo: string = `Chat Rotina #${rotinaCodigo}`,
  ): Promise<AICConversaIa> {
    return await this.prisma.aICConversaIa.create({
      data: {
        AICTitulo: titulo,
        INSInstituicaoCodigo: instituicaoCodigo,
        USRCodigo: userCodigo,
        ROTCodigo: rotinaCodigo,
        AIMCodigo: modelCodigo,
      },
    });
  }

  /**
   * Atualiza o título da conversa
   */
  async updateTitle(
    instituicaoCodigo: number,
    conversaCodigo: number,
    titulo: string,
  ): Promise<void> {
    await this.prisma.aICConversaIa.updateMany({
      where: {
        AICCodigo: conversaCodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
      },
      data: { AICTitulo: titulo },
    });
  }

  /**
   * Salva uma mensagem no histórico
   */
  async saveMessage(
    instituicaoCodigo: number,
    conversaCodigo: number,
    role: 'system' | 'user' | 'assistant',
    content: string,
    usageOpts?: { inputTokens: number; outputTokens: number; costUsd: number },
  ): Promise<AIMSMensagemIa> {
    return await this.prisma.aIMSMensagemIa.create({
      data: {
        AICCodigo: conversaCodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
        AIMSRole: role,
        AIMSContent: content,
        AIMSInputTokens: usageOpts?.inputTokens || 0,
        AIMSOutputTokens: usageOpts?.outputTokens || 0,
        AIMSCostUsd: usageOpts?.costUsd || 0,
      },
    });
  }

  /**
   * Lista histórico de mensagens de uma conversa
   */
  async getMessages(
    instituicaoCodigo: number,
    conversaCodigo: number,
  ): Promise<AIMSMensagemIa[]> {
    return await this.prisma.aIMSMensagemIa.findMany({
      where: {
        AICCodigo: conversaCodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
