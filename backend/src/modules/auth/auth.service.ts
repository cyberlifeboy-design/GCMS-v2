import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { authConfig } from '../../config/auth';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

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

        const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new Error('Invalid email or password');
        }

        const tokenPayload: TokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            stadiumId: user.stadiumId || undefined,
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
                stadiumId: user.stadiumId,
                stadium: user.stadium,
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

        // Send email (Mock or real depending on env)
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'localhost',
            port: Number(process.env.SMTP_PORT) || 1025,
            secure: false,
        });

        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

        try {
            await transporter.sendMail({
                from: '"GCMS Admin" <admin@gcms.local>',
                to: user.email,
                subject: 'Password Reset Request',
                text: `You requested a password reset. Please click here: ${resetUrl}`,
                html: `<p>You requested a password reset. Please click <a href="${resetUrl}">here</a> to reset your password.</p>`,
            });
        } catch (error) {
            console.error('Failed to send email:', error);
            // Don't throw error to prevent user enumeration or just inform them
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
}
