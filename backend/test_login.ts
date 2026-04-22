import { AuthService } from './src/modules/auth/auth.service';

async function test() {
    try {
        console.log('Testing login...');
        const result = await AuthService.login({
            email: 'superadmin@gcms.com',
            password: 'Admin@2024!'
        });
        console.log('✅ Login successful!');
        console.log('User role:', result.user.role);
    } catch (e: any) {
        console.error('❌ Login failed:', e.message);
    }
}

test();
