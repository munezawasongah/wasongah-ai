require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRouter     = require('../routes/auth');
const chatRouter     = require('../routes/chat');
const toolsRouter    = require('../routes/tools');
const streamRouter   = require('../routes/stream');
const paymentsRouter = require('../routes/payments');
const userRouter     = require('../routes/user');
const { rateLimiter } = require('../middleware/rateLimiter');
const { errorHandler } = require('../middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
const origin = process.env.FRONTEND_URL === '*' ? '*'
  : process.env.FRONTEND_URL?.split(',').map(s => s.trim());
app.use(cors({ origin, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));

// Stripe webhook needs raw body — register BEFORE json middleware
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));

// Body parsing
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limiting
app.use('/api/', rateLimiter);

// Serve frontend
const path = require('path');
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend.html')));
app.get('/api/health', (req, res) => res.json({ status: 'healthy', uptime: Math.floor(process.uptime()) + 's', timestamp: new Date().toISOString() }));

// Routes
app.use('/api/auth',     authRouter);
app.use('/api/chat',     chatRouter);
app.use('/api/tools',    toolsRouter);
app.use('/api/stream',   streamRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/user',     userRouter);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║        WasongahAI Backend v1.0       ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log(`  🚀  http://localhost:${PORT}`);
  console.log(`  🔑  Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗ MISSING'}`);
  console.log(`  🗄️   Supabase:  ${process.env.SUPABASE_URL ? '✓' : '✗ MISSING'}`);
  console.log(`  💳  Stripe:    ${process.env.STRIPE_SECRET_KEY ? '✓' : '✗ MISSING'}`);
  console.log(`  📱  M-Pesa:    ${process.env.MPESA_CONSUMER_KEY ? '✓' : '✗ MISSING'}\n`);
});

module.exports = app;
