import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // HTTPS is required so friends on the LAN (http://192.168.x.x) get a secure
  // context; without it crypto.subtle (ECDSA/ECDH/AES-GCM) is unavailable.
  plugins: [react(), basicSsl()],
  server: {
    host: true, // listen on all interfaces so other LAN devices can connect
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true
      }
    }
  }
})
