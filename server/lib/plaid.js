const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

// Switch environments via PLAID_ENV ('sandbox' | 'production'); defaults to sandbox.
// The client id is shared across environments; each environment has its own secret:
//   sandbox    -> PLAID_SANDBOX_SECRET
//   production -> PLAID_PROD_SECRET
const PLAID_ENV = process.env.PLAID_ENV === 'production' ? 'production' : 'sandbox';
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = PLAID_ENV === 'production'
  ? process.env.PLAID_PROD_SECRET
  : process.env.PLAID_SANDBOX_SECRET;

function isConfigured() {
  return Boolean(PLAID_CLIENT_ID && PLAID_SECRET);
}

let client = null;
function getClient() {
  if (!isConfigured()) return null;
  if (!client) {
    const configuration = new Configuration({
      basePath: PlaidEnvironments[PLAID_ENV],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
          'PLAID-SECRET': PLAID_SECRET,
        },
      },
    });
    client = new PlaidApi(configuration);
  }
  return client;
}

module.exports = { getClient, isConfigured, PLAID_ENV };
