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
    },
    // One active session per account (VAPT #3). A session ends after SESSION_IDLE_MINUTES
    // without user activity, or SESSION_MAX_HOURS after sign-in regardless (VAPT #5).
    session: {
        idleMs: Number(process.env.SESSION_IDLE_MINUTES || 15) * 60_000,
        maxMs: Number(process.env.SESSION_MAX_HOURS || 8) * 3_600_000,
    },
    bcrypt: {
        saltRounds: 10,
    },
};
