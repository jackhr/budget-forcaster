const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/income', require('./routes/income'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/scheduled', require('./routes/scheduled'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/debts', require('./routes/debts'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/plaid', require('./routes/plaid'));
app.use('/api/scenarios', require('./routes/scenarios'));
app.use('/api', require('./routes/data'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Budget Forecaster API running on http://localhost:${PORT}`);
});
