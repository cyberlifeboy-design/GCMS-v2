#!/bin/bash
# AGENT 1: Backend Critical Fixes
# Run: chmod +x agent_1_backend_fixes.sh && ./agent_1_backend_fixes.sh

set -e

cd /home/ubuntu/projects/GCMS/backend

echo "=========================================="
echo "AGENT 1: Backend Critical Fixes"
echo "=========================================="

# FIX-001: Fix password field name (already done by coordinator)
echo "[FIX-001] Checking users.service.ts password field..."
if grep -q "passwordHash:" src/modules/users/users.service.ts; then
    echo "✅ FIX-001 Already Complete"
else
    echo "Applying FIX-001..."
    sed -i 's/password: await bcrypt.hash(user.password/passwordHash: await bcrypt.hash(user.password/' src/modules/users/users.service.ts
    echo "✅ FIX-001 Complete"
fi

# FIX-002: Install rate limiting
echo "[FIX-002] Installing rate limiting dependencies..."
npm install express-rate-limit isomorphic-dompurify --save

# Create rate limit middleware
echo "[FIX-002] Creating rate limit middleware..."
cat > src/middleware/rateLimit.middleware.ts << 'EOF'
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { error: 'Too many authentication attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

export const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: { error: 'Too many requests, please try again later' },
});
EOF

echo "✅ FIX-002 Complete"

# FIX-003: Apply rate limiting to auth routes
echo "[FIX-003] Applying rate limits to auth routes..."

# Add import
if !grep -q "rateLimit.middleware" src/modules/auth/auth.routes.ts; then
    sed -i "/import { AuthController }/a import { authLimiter } from '../../middleware/rateLimit.middleware';" src/modules/auth/auth.routes.ts
fi

# Apply to login
sed -i "s/router.post('\\/login', AuthController.login);/router.post('\\/login', authLimiter, AuthController.login);/" src/modules/auth/auth.routes.ts || true
sed -i "s/router.post(\"\\/login\", AuthController.login);/router.post('\\/login', authLimiter, AuthController.login);/" src/modules/auth/auth.routes.ts || true

# Apply to register
sed -i "s/router.post('\\/register', AuthController.register);/router.post('\\/register', authLimiter, AuthController.register);/" src/modules/auth/auth.routes.ts || true

echo "✅ FIX-003 Complete"

# FIX-004: Add input sanitization middleware
echo "[FIX-004] Creating sanitization middleware..."
cat > src/middleware/sanitize.middleware.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';

export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    const sanitize = (obj: any): any => {
        if (typeof obj === 'string') {
            // Basic XSS prevention
            return obj
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;');
        }
        if (Array.isArray(obj)) {
            return obj.map(sanitize);
        }
        if (obj && typeof obj === 'object') {
            const sanitized: any = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[key] = sanitize(value);
            }
            return sanitized;
        }
        return obj;
    };

    if (req.body) {
        req.body = sanitize(req.body);
    }
    next();
};
EOF

# Apply sanitization to app.ts
if !grep -q "sanitize.middleware" src/app.ts; then
    sed -i "/import { auditLog } from '.*/a import { sanitizeInput } from './middleware/sanitize.middleware';" src/app.ts
    sed -i 's/app.use(express.urlencoded/app.use(sanitizeInput);\napp.use(express.urlencoded/' src/app.ts
fi

echo "✅ FIX-004 Complete"

# Restart the server
echo "[RESTART] Restarting server..."
pkill -f "tsx.*server.ts" || true
sleep 2
cd /home/ubuntu/projects/GCMS/backend
nohup npx tsx watch src/server.ts > server.log 2>&1 &
sleep 5

# Verify fixes
echo "[VERIFY] Testing server..."
if curl -s http://localhost:3001/health | grep -q "ok"; then
    echo "✅ Server running"
else
    echo "⚠️  Server may need manual restart"
fi

echo ""
echo "=========================================="
echo "AGENT 1 COMPLETE"
echo "=========================================="
echo "Fixed:"
echo "  - User bulkCreate passwordHash field"
echo "  - Rate limiting middleware"
echo "  - Input sanitization"
echo ""
echo "Next: Agent 2 (Database) and Agent 3 (Frontend) can start"
