import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export interface MicrosoftIdentity {
    email: string;
    name: string;
    oid: string;
}

export class MicrosoftAuthError extends Error {}

function buildJwksClient(tenantId: string) {
    return jwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        cacheMaxAge: 24 * 60 * 60 * 1000,
        rateLimit: true,
    });
}

/**
 * Verifies a Microsoft Entra ID (Azure AD) ID token from the frontend's public-client
 * MSAL login. No client secret is used or needed — signature is checked against
 * Microsoft's published JWKS for our tenant, scoped to our own Client ID as audience.
 */
export async function verifyMicrosoftToken(idToken: string): Promise<MicrosoftIdentity> {
    const tenantId = process.env.MSAL_TENANT_ID;
    const clientId = process.env.MSAL_CLIENT_ID;
    if (!tenantId || !clientId) {
        throw new MicrosoftAuthError('MICROSOFT_SSO_NOT_CONFIGURED');
    }

    const client = buildJwksClient(tenantId);

    const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
        client.getSigningKey(header.kid, (err, key) => {
            if (err || !key) {
                callback(err || new Error('Signing key not found'));
                return;
            }
            callback(null, key.getPublicKey());
        });
    };

    const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
        jwt.verify(
            idToken,
            getKey,
            {
                audience: clientId,
                issuer: [
                    `https://login.microsoftonline.com/${tenantId}/v2.0`,
                    `https://sts.windows.net/${tenantId}/`,
                ],
            },
            (err, decoded) => {
                if (err || !decoded || typeof decoded === 'string') {
                    reject(err || new Error('Invalid token payload'));
                    return;
                }
                resolve(decoded);
            },
        );
    });

    const email = (payload.preferred_username || payload.email) as string | undefined;
    const oid = payload.oid as string | undefined;
    const name = (payload.name as string | undefined) || email || 'Unknown';

    if (!email || !oid) {
        throw new MicrosoftAuthError('INVALID_MICROSOFT_TOKEN');
    }

    return { email: email.toLowerCase(), name, oid };
}
