import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import issuersRouter from './routes/issuers.js';
import threatRouter from './routes/threat.js';
import { setupLanRelay } from './services/lanRelay.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

// Initialize WebSocket LAN Relay
setupLanRelay(server);

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SecureQR Trust Registry API',
    time: new Date().toISOString()
  });
});

// Issuer trust registry & revocation routes
app.use('/api/issuers', issuersRouter);

// Pretrained Phishing-URL AI classification route
app.use('/api/threat', threatRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SecureQR Backend running on http://localhost:${PORT}`);
});
