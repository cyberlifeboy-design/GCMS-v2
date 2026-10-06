import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { authConfig } from '../../config/auth';
import crypto from 'crypto';
import { emailService } from '../../services/email.service';
import { verifyMicrosoftToken } from '../../services/microsoft-auth.service';
import { notificationTemplatesService } from '../notification-templates/notification-templates.service';

export type UserRole = 'SuperAdmin' | 'Admin' | 'FA' | 'Observer';

interface LoginData {
    email: string;
    password: string;
}

interface TokenPayload {
    userId: string;
    email: string;
    role: string;
    stadiumId?: string;
    departmentId?: string;
}

export class AuthService {
    static async login(data: LoginData) {
        const user = await prisma.user.findUnique({
            where: { email: data.email },
            include: { stadium: true },
        });

        if (!user) {
            throw new Error('Invalid email or password');
        }

        if (!user.isActive) {
            throw new Error('Account is deactivated. Please contact your administrator.');
        }

        if (user.isBlocked) {
            throw new Error('ACCOUNT_BLOCKED');
        }

        if (user.authProvider !== 'local') {
            throw new Error('This account signs in with your SC/LOC Microsoft account — use "Sign in with your SC/LOC account" instead.');
        }

        const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new Error('Invalid email or password');
        }

        const { accessToken, refreshToken } = await AuthService.issueSession(user);

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                isActive: user.isActive,
                exportFormat: user.exportFormat,
                stadiumId: user.stadiumId,
                stadium: user.stadium,
                departmentId: user.departmentId,
                authProvider: user.authProvider,
                mustChangePassword: user.mustChangePassword,
            },
        };
    }

    /**
     * Signs in via a verified Microsoft ID token. Matches an existing User by
     * microsoftOid first, then by email (backfilling microsoftOid on match, and
     * linking a local-password account to SSO going forward). Throws NOT_REGISTERED
     * (with .email/.name attached) when no matching account exists, so the caller
     * can route the browser to the access-request form.
     */
    static async loginWithMicrosoft(idToken: string) {
        const identity = await verifyMicrosoftToken(idToken);

        let user = await prisma.user.findUnique({ where: { microsoftOid: identity.oid }, include: { stadium: true } });
        if (!user) {
            user = await prisma.user.findUnique({ where: { email: identity.email }, include: { stadium: true } });
        }

        if (!user) {
            const err: any = new Error('NOT_REGISTERED');
            err.email = identity.email;
            err.name = identity.name;
            throw err;
        }

        if (!user.isActive) {
            throw new Error('Account is deactivated. Please contact your administrator.');
        }
        if (user.isBlocked) {
            throw new Error('ACCOUNT_BLOCKED');
        }

        if (user.authProvider !== 'microsoft' || user.microsoftOid !== identity.oid) {
            const wasAlreadyLinked = user.authProvider === 'microsoft';

            user = await prisma.user.update({
                where: { id: user.id },
                data: { authProvider: 'microsoft', microsoftOid: identity.oid },
                include: { stadium: true },
            });

            if (!wasAlreadyLinked) {
                try {
                    const rendered = await notificationTemplatesService.renderEmail('account_linked_microsoft', {
                        name: user.name,
                        email: user.email,
                    });
                    if (rendered) {
                        await emailService.send({ to: user.email, subject: rendered.subject, text: rendered.body });
                    }
                } catch (e) {
                    console.error('SSO account-link notification email failed:', e);
                }
            }
        }

        const { accessToken, refreshToken } = await AuthService.issueSession(user);

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                isActive: user.isActive,
                exportFormat: user.exportFormat,
                stadiumId: user.stadiumId,
                stadium: user.stadium,
                departmentId: user.departmentId,
                authProvider: user.authProvider,
                mustChangePassword: user.mustChangePassword,
            },
        };
    }

    /**
     * Starts the account's only session (VAPT #3): every earlier session is revoked, so
     * another device signed in as this user is logged out on its next request. The
     * RefreshToken row IS the session — its id travels in the access token as `sid`,
     * and its expiresAt is the idle deadline that `authenticate` slides forward.
     */
    static async issueSession(user: { id: string; email: string; role: string; stadiumId: string | null; departmentId: string | null }) {
        // Opaque 256-bit random token: validity lives in the DB row, not in the token itself
        // (fits the VARCHAR(191) column; a JWT with a jti does not).
        const refreshToken = crypto.randomBytes(32).toString('hex');

        const [, session] = await prisma.$transaction([
            prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
            prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + authConfig.session.idleMs) } }),
        ]);

        return { accessToken: AuthService.signAccessToken(user, session.id), refreshToken };
    }

    static signAccessToken(user: { id: string; email: string; role: string; stadiumId: string | null; departmentId: string | null }, sid: string) {
        const payload: TokenPayload & { sid: string } = {
            userId: user.id,
            email: user.email,
            role: user.role,
            stadiumId: user.stadiumId || undefined,
            departmentId: user.departmentId || undefined,
            sid,
        };
        return jwt.sign(payload, authConfig.jwt.accessTokenSecret, { expiresIn: authConfig.jwt.accessTokenExpiry });
    }

    /** True once a session is past its idle deadline or its absolute lifetime. */
    static isSessionExpired(session: { expiresAt: Date; createdAt: Date }, now = Date.now()) {
        return session.expiresAt.getTime() <= now || session.createdAt.getTime() + authConfig.session.maxMs <= now;
    }

    static async refreshAccessToken(refreshToken: string) {
        try {
            const storedToken = await prisma.refreshToken.findUnique({
                where: { token: refreshToken },
                include: { user: true },
            });

            if (!storedToken) {
                throw new Error('Invalid refresh token');
            }

            // Refreshing does not count as activity — only real requests slide the idle deadline.
            if (AuthService.isSessionExpired(storedToken)) {
                await prisma.refreshToken.delete({ where: { id: storedToken.id } });
                throw new Error('Refresh token expired');
            }

            if (!storedToken.user.isActive || storedToken.user.isBlocked) {
                throw new Error('Account disabled');
            }

            return { accessToken: AuthService.signAccessToken(storedToken.user, storedToken.id) };
        } catch (error) {
            throw new Error('Invalid or expired refresh token');
        }
    }

    static async logout(userId: string, refreshToken?: string) {
        if (refreshToken) {
            await prisma.refreshToken.deleteMany({
                where: { userId, token: refreshToken },
            });
        } else {
            await prisma.refreshToken.deleteMany({ where: { userId } });
        }
    }

    /** Ends every session of the account except `keepSessionId` (credential change / disable). */
    static async revokeSessions(userId: string, keepSessionId?: string) {
        await prisma.refreshToken.deleteMany({
            where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
        });
    }

    static async forgotPassword(email: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) throw new Error('User not found');

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: token,
                resetPasswordExpires: expires,
            },
        });

        // Send email via email service (Resend in production, SMTP/MailHog in dev)
        try {
            await emailService.sendPasswordResetEmail(user.email, token);
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            // Don't throw error to prevent user enumeration
        }

        return { message: 'Password reset email sent' };
    }

    static async resetPassword(token: string, newPassword: string) {
        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: { gte: new Date() },
            },
        });

        if (!user) throw new Error('Invalid or expired token');

        const passwordHash = await bcrypt.hash(newPassword, authConfig.bcrypt.saltRounds);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                resetPasswordToken: null,
                resetPasswordExpires: null,
            },
        });
        await AuthService.revokeSessions(user.id);

        return { message: 'Password reset successful' };
    }

    static async cleanupExpiredTokens() {
        await prisma.refreshToken.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
    }

    static async getUserById(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { stadium: true },
        });

        if (!user) return null;

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            isActive: user.isActive,
            exportFormat: user.exportFormat,
            exportPreferences: user.exportPreferences,
            stadiumId: user.stadiumId,
            departmentId: user.departmentId,
            stadium: user.stadium,
            authProvider: user.authProvider,
            mustChangePassword: user.mustChangePassword,
        };
    }

    static async changePassword(userId: string, currentPassword: string, newPassword: string, currentSessionId?: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) throw new Error('Current password is incorrect');

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash, mustChangePassword: false },
        });
        await AuthService.revokeSessions(userId, currentSessionId);
    }
}
