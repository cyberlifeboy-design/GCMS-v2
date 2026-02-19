import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { authConfig } from '../../config/auth';

interface RegisterData {
    name: string;
    email: string;
    password: string;
    accreditationId: string;
    role: 'Admin' | 'LCC' | 'FocalPoint' | 'Contractor';
    faTrigram?: string;
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
    faTrigram?: string;
    stadiumId?: string;
}

export class AuthService {
    /**
     * Register a new user
     */
    static async register(data: RegisterData) {
        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: data.email },
                    { accreditationId: data.accreditationId },
                ],
            },
        });

        if (existingUser) {
            throw new Error('User with this email or accreditation ID already exists');
        }

        // Validate role-specific requirements
        if (data.role === 'FocalPoint' && !data.faTrigram) {
            throw new Error('FocalPoint role requires faTrigram');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(data.password, authConfig.bcrypt.saltRounds);

        // Create user
        const user = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                accreditationId: data.accreditationId,
                passwordHash,
                role: data.role,
                faTrigram: data.faTrigram,
                stadiumId: data.stadiumId,
            },
            select: {
                id: true,
                name: true,
                email: true,
                accreditationId: true,
                role: true,
                faTrigram: true,
                stadiumId: true,
                createdAt: true,
            },
        });

        return user;
    }

    /**
     * Login user and generate tokens
     */
    static async login(data: LoginData) {
        // Find user
        const user = await prisma.user.findUnique({
            where: { email: data.email },
            include: { stadium: true },
        });

        if (!user) {
            throw new Error('Invalid email or password');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new Error('Invalid email or password');
        }

        // Generate tokens
        const tokenPayload: TokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            faTrigram: user.faTrigram || undefined,
            stadiumId: user.stadiumId || undefined,
        };

        const accessToken = jwt.sign(tokenPayload, authConfig.jwt.accessTokenSecret, {
            expiresIn: '15m',
        });

        const refreshToken = jwt.sign(
            { userId: user.id },
            authConfig.jwt.refreshTokenSecret,
            { expiresIn: '7d' }
        );

        // Store refresh token in database
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

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
                accreditationId: user.accreditationId,
                role: user.role,
                faTrigram: user.faTrigram,
                stadium: user.stadium,
            },
        };
    }

    /**
     * Refresh access token using refresh token
     */
    static async refreshAccessToken(refreshToken: string) {
        try {
            // Verify refresh token
            const payload = jwt.verify(refreshToken, authConfig.jwt.refreshTokenSecret) as {
                userId: string;
            };

            // Check if refresh token exists in database
            const storedToken = await prisma.refreshToken.findUnique({
                where: { token: refreshToken },
                include: { user: true },
            });

            if (!storedToken) {
                throw new Error('Invalid refresh token');
            }

            // Check if token is expired
            if (storedToken.expiresAt < new Date()) {
                await prisma.refreshToken.delete({ where: { id: storedToken.id } });
                throw new Error('Refresh token expired');
            }

            // Generate new access token
            const tokenPayload: TokenPayload = {
                userId: storedToken.user.id,
                email: storedToken.user.email,
                role: storedToken.user.role,
                faTrigram: storedToken.user.faTrigram || undefined,
                stadiumId: storedToken.user.stadiumId || undefined,
            };

            const accessToken = jwt.sign(tokenPayload, authConfig.jwt.accessTokenSecret, {
                expiresIn: '15m',
            });

            return { accessToken };
        } catch (error) {
            throw new Error('Invalid or expired refresh token');
        }
    }

    /**
     * Logout user (invalidate refresh token)
     */
    static async logout(userId: string, refreshToken?: string) {
        if (refreshToken) {
            // Delete specific refresh token
            await prisma.refreshToken.deleteMany({
                where: {
                    userId,
                    token: refreshToken,
                },
            });
        } else {
            // Delete all refresh tokens for user (logout from all devices)
            await prisma.refreshToken.deleteMany({
                where: { userId },
            });
        }
    }

    /**
     * Clean up expired refresh tokens
     */
    static async cleanupExpiredTokens() {
        await prisma.refreshToken.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        });
    }
}
