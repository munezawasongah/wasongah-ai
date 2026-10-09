require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const chatRouter   = require('../routes/chat');
const toolsRouter  = require('../routes/tools');
const streamRouter = require('../routes/stream');
const { errorHandler } = require('../middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

// CORS (set FRONTEND_URL to '*' or a comma-separated list; defaults to open)
const origin = !process.env.FRONTEND_URL || process.env.FRONTEND_URL === '*'
  ? '*'
  : process.env.FRONTEND_URL.split(',').map(s => s.trim());
app.use(cors({ origin, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Frontend + health
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend.html')));
app.get('/api/health', (req, res) => res.json({ status: 'healthy', uptime: Math.floor(process.uptime()) + 's', timestamp: new Date().toISOString() }));

// Routes (open to everyone, no auth, no credits, no rate limit)
app.use('/api/chat',   chatRouter);
app.use('/api/tools',  toolsRouter);
app.use('/api/stream', streamRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`WasongahAI running on http://localhost:${PORT}`);
  console.log(`Anthropic key: ${process.env.ANTHROPIC_API_KEY ? 'OK' : 'MISSING'}`);
});

module.exports = app;
