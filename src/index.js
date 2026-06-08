import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { errorHandler } from './middleware/errorHandler.js';
import { connectDB } from './db/client.js';
import authRoutes from './modules/auth/routes.js';
import usersRoutes from './modules/users/routes.js';
import factoriesRoutes from './modules/factories/routes.js';
import suppliersRoutes from './modules/suppliers/routes.js';
import customersRoutes from './modules/customers/routes.js';
import productsRoutes from './modules/products/routes.js';
import documentsRoutes from './modules/documents/routes.js';
import intakesRoutes from './modules/intakes/routes.js';
import batchesRoutes from './modules/batches/routes.js';
import shipmentsRoutes from './modules/shipments/routes.js';
import creditsRoutes from './modules/credits/routes.js';
import flagsRoutes   from './modules/flags/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import ledgerRoutes  from './modules/ledger/routes.js';
import retroRoutes   from './modules/retro/routes.js';
import { requestLogger } from './middleware/requestLogger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '../public');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);
app.use(express.static(PUBLIC_DIR));

app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/factories', factoriesRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/products',  productsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/intakes',   intakesRoutes);
app.use('/api/batches',   batchesRoutes);
app.use('/api/shipments', shipmentsRoutes);
app.use('/api/credits',   creditsRoutes);
app.use('/api/flags',     flagsRoutes);
app.use('/api/reports',   reportsRoutes);
app.use('/api/ledger',    ledgerRoutes);
app.use('/api/retro',     retroRoutes);

// SPA fallback — serve index.html for any non-API route
app.get('/{*path}', (req, res) => {
  res.sendFile(join(PUBLIC_DIR, 'index.html'));
});

app.use(errorHandler);

const checkEnv = (key) => (process.env[key] ? '✓' : '✗ NOT SET');

const logServicesStatus = async () => {
  const services = [
    { name: 'PostgreSQL', status: null },
    { name: 'Supabase URL', status: checkEnv('SUPABASE_URL') },
    { name: 'Supabase SRK', status: checkEnv('SUPABASE_SERVICE_ROLE_KEY') },
    { name: 'JWT Secret', status: checkEnv('JWT_SECRET') },
    { name: 'JWT Refresh Token', status: checkEnv('REFRESH_TOKEN_SECRET') },
    { name: 'Twilio OTP', status: checkEnv('TWILIO_ACCOUNT_SID') },
    { name: 'OCR', status: checkEnv('AZURE_OCR_KEY') },
    { name: 'Gemini', status: checkEnv('GEMINI_API_KEY') },
  ];

  try {
    await connectDB();
    services[0].status = '✓ connected';
  } catch (err) {
    services[0].status = `✗ FAILED — ${err.message}`;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  GreenPath Server — Services Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  services.forEach(({ name, status }) => {
    console.log(`  ${status.startsWith('✗') ? status : `\x1b[32m${status}\x1b[0m`}  ${name}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
};

app.listen(PORT, async () => {
  console.log(`\n🟢 Server running on port ${PORT}  [${process.env.NODE_ENV || 'development'}]`);
  await logServicesStatus();
});

export default app;
