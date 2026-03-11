import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface EmailOptions {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    from?: string;
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

        const { data, error } = await this.resend.emails.send(emailData as any);

        if (error) {
            console.error('Resend email error:', error);
            throw new Error(`Failed to send email via Resend: ${error.message}`);
        }

        console.log('Email sent via Resend:', data?.id);
    }
}

/**
 * MailHog/SMTP transport for development
 */
class SmtpTransport implements EmailTransport {
    private transporter: nodemailer.Transporter;
    private defaultFrom: string;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'localhost',
            port: Number(process.env.SMTP_PORT) || 1025,
            secure: false,
        });
        this.defaultFrom = process.env.EMAIL_FROM || '"GCMS Admin" <admin@gcms.local>';
    }

    async send(options: EmailOptions): Promise<void> {
        const { to, subject, text, html, from } = options;

        try {
            const info = await this.transporter.sendMail({
                from: from || this.defaultFrom,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject,
                text,
                html,
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
        const resendApiKey = process.env.RESEND_API_KEY;
        const isProduction = process.env.NODE_ENV === 'production';

        if (isProduction && resendApiKey) {
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