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
    build: {
        rollupOptions: {
            output: {
                // Split large, slow-changing vendor libraries into their own chunks so
                // browsers cache them independently of app code across deploys, instead
                // of re-downloading them every time any page's code changes.
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-charts': ['recharts'],
                    'vendor-radix': [
                        '@radix-ui/react-dialog',
                        '@radix-ui/react-select',
                        '@radix-ui/react-tabs',
                        '@radix-ui/react-label',
                        '@radix-ui/react-avatar',
                        '@radix-ui/react-slot',
                    ],
                },
            },
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
