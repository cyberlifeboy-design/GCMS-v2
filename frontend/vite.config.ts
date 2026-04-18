import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    base: '/',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 3000,
        allowedHosts: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3005',
                changeOrigin: true,
            },
        },
    },
    preview: {
        port: 4173,
        host: '0.0.0.0',
        strictPort: true,
        allowedHosts: true,
    },
})
