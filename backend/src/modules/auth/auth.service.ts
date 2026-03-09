import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { authConfig } from '../../config/auth';

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

    static async cleanupExpiredTokens() {
        await prisma.refreshToken.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
    }
}
