import { Injectable, Logger } from '@nestjs/common';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class BrevoMailService {
    private readonly logger = new Logger(BrevoMailService.name);
    private client: BrevoClient | null = null;

    private getClient(): BrevoClient | null {
        const apiKey = process.env.BREVO_API_KEY?.trim();
        if (!apiKey) {
            return null;
        }
        if (!this.client) {
            this.client = new BrevoClient({ apiKey });
        }
        return this.client;
    }

    async sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
        const fromEmail = process.env.EMAIL_FROM?.trim();
        const fromName = process.env.EMAIL_FROM_NAME?.trim() || 'SchoolGuard';

        if (!fromEmail) {
            throw new Error('EMAIL_FROM não configurado');
        }

        const client = this.getClient();
        if (!client) {
            throw new Error('BREVO_API_KEY não configurada');
        }

        const subject = 'Redefinição de senha — SchoolGuard';
        const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; line-height: 1.5; color: #333;">
  <p>Olá,</p>
  <p>Recebemos um pedido para redefinir a senha da sua conta SchoolGuard.</p>
  <p><a href="${resetUrl}" style="color: #465fff;">Redefinir minha senha</a></p>
  <p>Se você não solicitou, ignore este e-mail. O link expira em 1 hora.</p>
  <p style="font-size: 12px; color: #666;">Se o botão não funcionar, copie e cole no navegador:<br/>${resetUrl}</p>
</body>
</html>`;
        const textContent = `Redefinição de senha SchoolGuard\n\nAcesse o link (válido por 1 hora):\n${resetUrl}\n\nSe você não solicitou, ignore este e-mail.`;

        try {
            await client.transactionalEmails.sendTransacEmail({
                sender: { email: fromEmail, name: fromName },
                to: [{ email: toEmail }],
                subject,
                htmlContent,
                textContent,
                tags: ['password-reset'],
            });
        } catch (err) {
            this.logger.error('Falha ao enviar e-mail Brevo', err);
            throw err;
        }
    }
}
