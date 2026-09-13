import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface EmailOptions {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    from?: string;
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

export interface EmailTransport {
    send(options: EmailOptions): Promise<void>;
}

/**
 * Resend email transport for production
 */
class ResendTransport implements EmailTransport {
    private resend: Resend;
    private defaultFrom: string;

    constructor(apiKey: string) {
        this.resend = new Resend(apiKey);
        this.defaultFrom = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    }

    async send(options: EmailOptions): Promise<void> {
        const { to, subject, text, html, from } = options;

        // Resend requires at least html or text
        const emailData: {
            from: string;
            to: string[];
            subject: string;
            html?: string;
            text?: string;
        } = {
            from: from || this.defaultFrom,
            to: Array.isArray(to) ? to : [to],
            subject,
        };

        if (html) {
            emailData.html = html;
        }
        if (text) {
            emailData.text = text;
        }
        if (options.attachments?.length) {
            (emailData as any).attachments = options.attachments.map(a => ({
                filename: a.filename,
                content: a.content,
                ...(a.contentType ? { content_type: a.contentType } : {}),
            }));
        }

        const { data, error } = await this.resend.emails.send(emailData as any);

        if (error) {
            console.error('Resend email error:', error);
            throw new Error(`Failed to send email via Resend: ${error.message}`);
        }

        console.log('Email sent via Resend:', data?.id);
    }
}

/**
 * MailHog/SMTP transport for development — and, once configured, the org's
 * own corporate SMTP server (Super Admin > Settings > Email/SMTP). DB-stored
 * settings are checked on every send and take priority over the SMTP_* env
 * vars, so an admin can change/rotate them without a redeploy; the
 * transporter is rebuilt only when the resolved config actually changes.
 */
class SmtpTransport implements EmailTransport {
    private cachedTransporter: nodemailer.Transporter | null = null;
    private cachedConfigKey = '';
    private envFallbackFrom: string;

    constructor() {
        this.envFallbackFrom = process.env.EMAIL_FROM || '"GCMS Admin" <admin@gcms.local>';
    }

    private async resolveConfig() {
        let dbSettings: {
            smtpHost: string | null; smtpPort: number | null; smtpSecure: boolean;
            smtpUser: string | null; smtpPassword: string | null;
            smtpFromEmail: string | null; smtpFromName: string | null;
        } | null = null;
        try {
            const { prisma } = await import('../config/database');
            dbSettings = await prisma.systemSettings.findFirst({
                select: {
                    smtpHost: true, smtpPort: true, smtpSecure: true, smtpUser: true,
                    smtpPassword: true, smtpFromEmail: true, smtpFromName: true,
                },
            });
        } catch (e) {
            console.error('Could not load SMTP settings from DB, falling back to env:', e);
        }

        const host = dbSettings?.smtpHost || process.env.SMTP_HOST || 'localhost';
        const port = dbSettings?.smtpPort || Number(process.env.SMTP_PORT) || 1025;
        const secure = dbSettings?.smtpHost ? !!dbSettings.smtpSecure : process.env.SMTP_SECURE === 'true';
        const user = dbSettings?.smtpUser || process.env.SMTP_USER;
        const pass = dbSettings?.smtpPassword || process.env.SMTP_PASS;
        const from = dbSettings?.smtpFromEmail
            ? `"${dbSettings.smtpFromName || 'GCMS'}" <${dbSettings.smtpFromEmail}>`
            : this.envFallbackFrom;

        return { host, port, secure, user, pass, from };
    }

    private async getTransporter(): Promise<{ transporter: nodemailer.Transporter; from: string }> {
        const { host, port, secure, user, pass, from } = await this.resolveConfig();
        const configKey = JSON.stringify({ host, port, secure, user, pass });
        if (!this.cachedTransporter || configKey !== this.cachedConfigKey) {
            this.cachedTransporter = nodemailer.createTransport({
                host, port, secure,
                ...(user && pass ? { auth: { user, pass } } : {}),
            });
            this.cachedConfigKey = configKey;
        }
        return { transporter: this.cachedTransporter, from };
    }

    async send(options: EmailOptions): Promise<void> {
        const { to, subject, text, html, from } = options;
        const { transporter, from: configuredFrom } = await this.getTransporter();

        try {
            const info = await transporter.sendMail({
                from: from || configuredFrom,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject,
                text,
                html,
                attachments: options.attachments?.map(a => ({
                    filename: a.filename,
                    content: a.content,
                    ...(a.contentType ? { contentType: a.contentType } : {}),
                })),
            });

            console.log('Email sent via SMTP:', info.messageId);
        } catch (error) {
            console.error('SMTP email error:', error);
            throw new Error('Failed to send email via SMTP');
        }
    }
}

/**
 * Email service with automatic transport selection
 * - Uses Resend in production when RESEND_API_KEY is set
 * - Falls back to SMTP/MailHog for development
 */
class EmailService implements EmailTransport {
    private transport: EmailTransport;

    constructor() {
        const driver = (process.env.EMAIL_DRIVER || '').toLowerCase();
        const resendApiKey = process.env.RESEND_API_KEY;
        const isProduction = process.env.NODE_ENV === 'production';

        if (driver === 'smtp') {
            this.transport = new SmtpTransport();
            console.log('Email service initialized: SMTP (EMAIL_DRIVER=smtp)');
        } else if (driver === 'resend' && resendApiKey) {
            this.transport = new ResendTransport(resendApiKey);
            console.log('Email service initialized: Resend (EMAIL_DRIVER=resend)');
        } else if (isProduction && resendApiKey) {
            // Production with Resend
            this.transport = new ResendTransport(resendApiKey);
            console.log('Email service initialized: Resend (production)');
        } else if (isProduction && !resendApiKey) {
            // Production without Resend - log warning and fall back to SMTP
            console.warn('WARNING: RESEND_API_KEY not set in production. Falling back to SMTP.');
            this.transport = new SmtpTransport();
        } else {
            // Development - use MailHog/SMTP
            this.transport = new SmtpTransport();
            console.log('Email service initialized: SMTP/MailHog (development)');
        }
    }

    async send(options: EmailOptions): Promise<void> {
        await this.transport.send(options);
    }

    /**
     * Send a password reset email
     */
    async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

        await this.send({
            to: email,
            subject: 'Password Reset Request',
            text: `You requested a password reset. Please click here: ${resetUrl}`,
            html: `<p>You requested a password reset. Please click <a href="${resetUrl}">here</a> to reset your password.</p>
                   <p>This link will expire in 1 hour.</p>
                   <p>If you did not request this, please ignore this email.</p>`,
        });
    }
}

// Export singleton instance
export const emailService = new EmailService();