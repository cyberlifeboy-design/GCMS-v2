import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const tenantId = env.VITE_MSAL_TENANT_ID;
const clientId = env.VITE_MSAL_CLIENT_ID;

/** False until Ahmed's Entra ID App Registration values are set as build/app env vars. */
export const msalEnabled = Boolean(tenantId && clientId);

const msalConfig: Configuration = {
    auth: {
        clientId: clientId || '00000000-0000-0000-0000-000000000000',
        authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
        redirectUri: '/auth/microsoft/callback',
        // Finish the sign-in ON the callback page. The default (true) makes MSAL bounce the
        // browser back to /login first, where nothing processes the response — the SSO
        // login silently did nothing and the user landed back on the login page.
        navigateToLoginRequestUrl: false,
    },
    cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
    },
};

export const msalInstance = new PublicClientApplication(msalConfig);

let initPromise: Promise<void> | null = null;

/** MSAL v3 requires an explicit async initialize() before any other call — memoized so callers can await it freely. */
export function ensureMsalInitialized(): Promise<void> {
    if (!initPromise) {
        initPromise = msalInstance.initialize();
    }
    return initPromise;
}

export const MICROSOFT_LOGIN_SCOPES = ['openid', 'profile', 'email'];
