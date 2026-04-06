const https = require('https');

// 소스별 Teams Webhook URL
const TEAMS_WEBHOOKS = {
  apple: 'https://gmeremittance.webhook.office.com/webhookb2/d6483228-bbb2-4539-b489-864cf7e723d0@b19514d1-d63d-4dda-b580-d80917436738/IncomingWebhook/649bad193b954012bb11c66cf2892602/7abd5e30-9e61-4f38-8cc1-9dcc6c3f1817/V2WlnujZKsgqbFyu3CToIZu-ILLlFWKjv9bOroF8syjkE1',
  default: 'https://gmeremittance.webhook.office.com/webhookb2/d6483228-bbb2-4539-b489-864cf7e723d0@b19514d1-d63d-4dda-b580-d80917436738/IncomingWebhook/1ce449148c374b9b9854639edd281a36/7abd5e30-9e61-4f38-8cc1-9dcc6c3f1817/V2Ht8amNk3K8IclcrWt3d5mvnfI8RMC-KYwEJncpJBjdE1',
};

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function now() {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function sendToTeams(card, source) {
  const webhookUrl = TEAMS_WEBHOOKS[source] || TEAMS_WEBHOOKS.default;
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(card);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 소스별 카드 빌더
const handlers = {
  apple(body) {
    const { signedPayload } = body;
    if (!signedPayload) return null;

    const payload = decodeJwtPayload(signedPayload);
    if (!payload) return null;

    const type = payload.notificationType || 'UNKNOWN';
    const subtype = payload.subtype || '';
    const data = payload.data || {};
    const icons = {
      SUBSCRIBED: '🟢', DID_RENEW: '🔄', DID_CHANGE_RENEWAL_STATUS: '⚙️',
      DID_FAIL_TO_RENEW: '🔴', EXPIRED: '⛔', REFUND: '💸',
      CONSUMPTION_REQUEST: '📋', TEST: '🧪',
    };

    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      themeColor: type.includes('FAIL') || type === 'EXPIRED' ? 'FF0000' : '0078D7',
      summary: `Apple: ${type}`,
      sections: [{
        activityTitle: `${icons[type] || 'ℹ️'} App Store: ${type}`,
        activitySubtitle: now(),
        facts: [
          { name: 'Type', value: type },
          ...(subtype ? [{ name: 'Subtype', value: subtype }] : []),
          { name: 'Bundle ID', value: data.bundleId || '-' },
          { name: 'Environment', value: data.environment || '-' },
        ],
      }],
    };
  },

  fallback(body, source) {
    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `Webhook: ${source}`,
      sections: [{
        activityTitle: `📨 Webhook 수신 (${source})`,
        activitySubtitle: now(),
        text: `\`\`\`\n${JSON.stringify(body, null, 2).substring(0, 1500)}\n\`\`\``,
      }],
    };
  },
};

function detectSource(body) {
  if (body && body.signedPayload) return 'apple';
  return 'unknown';
}

// Vercel Serverless Function
// URL: /api/webhook?source=apple 또는 /api/webhook (자동 감지)
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const source = req.query.source || detectSource(req.body);
  console.log(`[${new Date().toISOString()}] source=${source}`);

  try {
    const body = req.body;
    const handler = handlers[source];
    const card = handler ? handler(body) : null;
    const result = await sendToTeams(card || handlers.fallback(body, source), source);
    console.log(`Teams response: ${result.status}`);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(200).json({ status: 'ok' });
  }
};
