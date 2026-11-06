const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { attachUser, requireAuth } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Credentials must be allowed for the session cookie to travel in dev, where the
// client is served from a different origin than the API.
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
// req.ip respects X-Forwarded-For only behind a trusted proxy; the login
// throttle keys on it, so it must not be spoofable.
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
app.use(attachUser);

// --- Public ---
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));

// --- Everything below requires a session ---
app.use('/api', requireAuth);

app.use('/api/income', require('./routes/income'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/debts', require('./routes/debts'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/buckets', require('./routes/buckets'));
app.use('/api/plaid', require('./routes/plaid'));
app.use('/api/scenarios', require('./routes/scenarios'));
app.use('/api/paid', require('./routes/paid').router);
app.use('/api', require('./routes/data'));

app.listen(PORT, () => {
  console.log(`Budget Forecaster API running on http://localhost:${PORT}`);
});
