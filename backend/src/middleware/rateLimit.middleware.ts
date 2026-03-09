import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 100 : 5, // Be more lenient in dev
    message: { error: 'Too many authentication attempts' },
    standardHeaders: true,
    legacyHeaders: false,
});

export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many requests' },
});
