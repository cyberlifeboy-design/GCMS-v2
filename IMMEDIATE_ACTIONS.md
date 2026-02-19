# GCMS - Immediate Actions (Quick Fixes)

**Quick reference for immediate fixes that can be applied now**

---

## Quick Fix 1: Fix Backend Password Field Bug

**File:** `backend/src/modules/users/users.service.ts`
**Line:** 56
**Severity:** 🔴 Critical

```bash
# Run this command to fix the bug
sed -i 's/password: await bcrypt.hash(user.password/passwordHash: await bcrypt.hash(user.password/' /home/ubuntu/projects/GCMS/backend/src/modules/users/users.service.ts
```

**Manual fix if sed fails:**
```typescript
// Change line 56 from:
password: await bcrypt.hash(user.password || 'welcome123', saltRounds),
// To:
passwordHash: await bcrypt.hash(user.password || 'welcome123', saltRounds),
```

---

## Quick Fix 2: Install shadcn/ui for Frontend

```bash
cd /home/ubuntu/projects/GCMS/frontend

# Initialize shadcn
npx shadcn-ui@latest init --yes --template next --base-color slate

# Add essential components
npx shadcn-ui@latest add button input card table dialog select label badge avatar
```

---

## Quick Fix 3: Add Required Dependencies

```bash
# Backend dependencies
cd /home/ubuntu/projects/GCMS/backend
npm install express-rate-limit isomorphic-dompurify

# Frontend dependencies
cd /home/ubuntu/projects/GCMS/frontend
npm install react-signature-canvas @types/react-signature-canvas
```

---

## Quick Fix 4: Create API Client File

**Create:** `frontend/src/lib/api.ts`

```typescript
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token interceptor
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
```

---

## Quick Fix 5: Create Basic Login Page

**Create:** `frontend/src/pages/Login.tsx`

```typescript
import { useState } from 'react';
import axios from 'axios';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await axios.post('http://localhost:3001/api/v1/auth/login', {
                email,
                password,
            });
            localStorage.setItem('accessToken', res.data.accessToken);
            window.location.href = '/';
        } catch (err) {
            alert('Login failed');
        }
    };

    return (
        <div style={{ maxWidth: 400, margin: '100px auto', padding: 20 }}>
            <h1>GCMS Login</h1>
            <form onSubmit={handleSubmit}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }}
                />
                <button type="submit" style={{ width: '100%', padding: 10 }}>
                    Login
                </button>
            </form>
            <p>Test: admin@gcms.com / admin123456</p>
        </div>
    );
}
```

---

## Quick Fix 6: Update App.tsx

**File:** `frontend/src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<div>Dashboard (Protected)</div>} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
```

---

## Verification Commands

```bash
# Check backend is running
curl http://localhost:3001/health

# Test login endpoint
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gcms.com","password":"admin123456"}'

# Check Docker containers
docker ps

# View backend logs
docker logs gcms-postgres
docker logs gcms-minio
```

---

## File Structure to Create

```
frontend/src/
├── lib/
│   └── api.ts          # Create this
├── pages/
│   └── Login.tsx       # Create this
├── stores/
│   └── (empty for now)
├── components/
│   └── ui/             # shadcn components here
└── types/
    └── (empty for now)
```

---

## Priority Order

1. **Fix backend bug** (2 minutes)
2. **Install shadcn** (5 minutes)
3. **Add dependencies** (2 minutes)
4. **Create api.ts** (5 minutes)
5. **Create Login page** (10 minutes)
6. **Update App.tsx** (5 minutes)

**Total time: ~30 minutes for basic working version**

---

## Test Credentials

```
Email: admin@gcms.com
Password: admin123456
```

---

## Need Help?

Refer to:
- `GCMS_COMPREHENSIVE_AUDIT_REPORT.md` - Full audit details
- `SWARM_AGENT_DISPATCH_GUIDE.md` - Detailed implementation guide
