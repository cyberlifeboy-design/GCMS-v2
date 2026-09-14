import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { authConfig } from '../../config/auth';
import crypto from 'crypto';
import { emailService } from '../../services/email.service';
import { verifyMicrosoftToken } from '../../services/microsoft-auth.service';

export type UserRole = 'SuperAdmin' | 'Admin' | 'FA' | 'Observer';

interface RegisterData {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    phone?: string;
    stadiumId?: string;
}

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
    static async register(data: RegisterData) {
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw new Error('User with this email already exists');
        }

        const passwordHash = await bcrypt.hash(data.password, authConfig.bcrypt.saltRounds);

        const user = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                passwordHash,
                role: data.role,
                phone: data.phone,
                stadiumId: data.stadiumId,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                isActive: true,
                exportFormat: true,
                stadiumId: true,
                createdAt: true,
            },
        });

        return user;
    }

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

        const tokenPayload: TokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            stadiumId: user.stadiumId || undefined,
            departmentId: user.departmentId || undefined,
        };

        const accessToken = jwt.sign(tokenPayload, authConfig.jwt.accessTokenSecret, {
            expiresIn: '15m',
        } as any);

        const refreshToken = jwt.sign(
            { userId: user.id },
            authConfig.jwt.refreshTokenSecret,
            { expiresIn: '7d' } as any
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt,
            },
        });

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
                    await emailService.send({
                        to: user.email,
                        subject: 'Your GCMS account is now linked to your SC/LOC Microsoft account',
                        text: `Hello ${user.name},\n\nYour GCMS account (${user.email}) has just been linked to sign in with your SC/LOC Microsoft account. If this wasn't you, please contact your administrator immediately.\n\nThank you,\nGCMS`,
                    });
                } catch (e) {
                    console.error('SSO account-link notification email failed:', e);
                }
            }
        }

        const tokenPayload: TokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            stadiumId: user.stadiumId || undefined,
            departmentId: user.departmentId || undefined,
        };

        const accessToken = jwt.sign(tokenPayload, authConfig.jwt.accessTokenSecret, { expiresIn: '15m' } as any);
        const refreshToken = jwt.sign({ userId: user.id }, authConfig.jwt.refreshTokenSecret, { expiresIn: '7d' } as any);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });

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
                authProvider: user.authProvider,
                mustChangePassword: user.mustChangePassword,
            },
        };
    }

    static async refreshAccessToken(refreshToken: string) {
        try {
            const payload = jwt.verify(refreshToken, authConfig.jwt.refreshTokenSecret) as {
                userId: string;
            };

            const storedToken = await prisma.refreshToken.findUnique({
                where: { token: refreshToken },
                include: { user: true },
            });

            if (!storedToken) {
                throw new Error('Invalid refresh token');
            }

            if (storedToken.expiresAt < new Date()) {
                await prisma.refreshToken.delete({ where: { id: storedToken.id } });
                throw new Error('Refresh token expired');
            }

            const tokenPayload: TokenPayload = {
                userId: storedToken.user.id,
                email: storedToken.user.email,
                role: storedToken.user.role,
                stadiumId: storedToken.user.stadiumId || undefined,
                departmentId: storedToken.user.departmentId || undefined,
            };

            const accessToken = jwt.sign(tokenPayload, authConfig.jwt.accessTokenSecret, {
                expiresIn: '15m',
            } as any);

            return { accessToken };
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

    static async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) throw new Error('Current password is incorrect');

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash, mustChangePassword: false },
        });
    }
}
