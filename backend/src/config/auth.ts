/**
 * Get JWT secret or throw error in production
 */
const getJwtSecret = (envVar: string, secretName: string): string => {
    const secret = process.env[envVar];
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(`${envVar} must be set in production`);
        }
        console.warn(`WARNING: Using development-only secret for ${secretName}. Set ${envVar} in production!`);
        return `dev-only-${secretName}-not-for-production-use`;
    }
    return secret;
};

export const authConfig = {
    jwt: {
        accessTokenSecret: getJwtSecret('JWT_ACCESS_SECRET', 'access'),
        refreshTokenSecret: getJwtSecret('JWT_REFRESH_SECRET', 'refresh'),
        accessTokenExpiry: '15m' as const, // 15 minutes
        refreshTokenExpiry: '7d' as const, // 7 days
    },
    bcrypt: {
        saltRounds: 10,
    },
};
