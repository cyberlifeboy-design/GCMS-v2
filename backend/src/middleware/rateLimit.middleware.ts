import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 100 : 5, // Be more lenient in dev
    // IP + target account: still 5 guesses per account, but one noisy client behind a
    // shared proxy IP can't lock every other user out of signing in.
    keyGenerator: (req: Request) =>
        `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
    message: { error: 'Too many authentication attempts' },
    standardHeaders: true,
    legacyHeaders: false,
});

export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Booking / car-request creation. Mount AFTER authenticate: keyed on the account, not
// the IP — behind Azure App Service + nginx every client can share one proxy IP, and
// X-Forwarded-For is client-controllable, so an IP key is neither fair nor unspoofable.
// A recurring booking is one request, so 20/hour is generous for a real user.
export const submissionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyGenerator: (req: Request) => (req as Request & { user: { userId: string } }).user.userId,
    message: { error: 'Too many submissions. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
