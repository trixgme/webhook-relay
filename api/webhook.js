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

// App Store Connect 알림 타입 매핑
const APPLE_TYPES = {
  // Ping
  webhookPingCreated: { icon: '🏓', label: 'Ping 테스트', color: '808080' },
  // 앱 상태
  appStatusChanged: { icon: '📱', label: '앱 상태 변경', color: '0078D7' },
  // 빌드
  buildCreated: { icon: '🔨', label: '빌드 생성', color: '0078D7' },
  buildProcessingComplete: { icon: '✅', label: '빌드 처리 완료', color: '00CC00' },
  buildProcessingFailed: { icon: '❌', label: '빌드 처리 실패', color: 'FF0000' },
  // 심사
  reviewSubmissionCreated: { icon: '📤', label: '심사 제출', color: 'FFA500' },
  reviewSubmissionApproved: { icon: '✅', label: '심사 승인', color: '00CC00' },
  reviewSubmissionRejected: { icon: '❌', label: '심사 거절', color: 'FF0000' },
  // 인앱 구매
  subscriptionCreated: { icon: '🟢', label: '구독 생성', color: '00CC00' },
  subscriptionRenewed: { icon: '🔄', label: '구독 갱신', color: '0078D7' },
  subscriptionExpired: { icon: '⛔', label: '구독 만료', color: 'FF0000' },
  subscriptionRevoked: { icon: '🚫', label: '구독 취소', color: 'FF0000' },
  refundRequested: { icon: '💸', label: '환불 요청', color: 'FFA500' },
  // 테스트
  testNotification: { icon: '🧪', label: '테스트 알림', color: '808080' },
};

// App Store Server Notifications V2 (signedPayload) 타입 매핑
const APPLE_SERVER_TYPES = {
  SUBSCRIBED: { icon: '🟢', label: '구독 시작', color: '00CC00' },
  DID_RENEW: { icon: '🔄', label: '구독 갱신', color: '0078D7' },
  DID_CHANGE_RENEWAL_STATUS: { icon: '⚙️', label: '갱신 상태 변경', color: 'FFA500' },
  DID_FAIL_TO_RENEW: { icon: '🔴', label: '갱신 실패', color: 'FF0000' },
  EXPIRED: { icon: '⛔', label: '구독 만료', color: 'FF0000' },
  REFUND: { icon: '💸', label: '환불', color: 'FFA500' },
  CONSUMPTION_REQUEST: { icon: '📋', label: '소비 요청', color: '0078D7' },
  TEST: { icon: '🧪', label: '테스트', color: '808080' },
  REVOKE: { icon: '🚫', label: '취소', color: 'FF0000' },
  GRACE_PERIOD_EXPIRED: { icon: '⏰', label: '유예기간 만료', color: 'FF0000' },
  OFFER_REDEEMED: { icon: '🎁', label: '오퍼 사용', color: '00CC00' },
  PRICE_INCREASE: { icon: '💰', label: '가격 인상', color: 'FFA500' },
};

// 소스별 카드 빌더
const handlers = {
  apple(body) {
    // App Store Server Notifications V2 (signedPayload 방식)
    if (body.signedPayload) {
      const payload = decodeJwtPayload(body.signedPayload);
      if (!payload) return null;

      const type = payload.notificationType || 'UNKNOWN';
      const subtype = payload.subtype || '';
      const data = payload.data || {};
      const info = APPLE_SERVER_TYPES[type] || { icon: 'ℹ️', label: type, color: '0078D7' };

      const facts = [
        { name: '타입', value: `${info.icon} ${info.label}` },
        ...(subtype ? [{ name: '세부', value: subtype }] : []),
        { name: 'Bundle ID', value: data.bundleId || '-' },
        { name: '환경', value: data.environment || '-' },
      ];

      return {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        themeColor: info.color,
        summary: `Apple: ${info.label}`,
        sections: [{
          activityTitle: `🍎 App Store Server: ${info.label}`,
          activitySubtitle: now(),
          facts,
        }],
      };
    }

    // App Store Connect API 웹훅 (일반 JSON 방식)
    if (body.data) {
      const { type, id, attributes } = body.data;
      const info = APPLE_TYPES[type] || { icon: 'ℹ️', label: type, color: '0078D7' };
      const ts = attributes?.timestamp
        ? new Date(attributes.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
        : now();

      const facts = [
        { name: '타입', value: `${info.icon} ${info.label}` },
        { name: 'ID', value: id || '-' },
        { name: '시각', value: ts },
      ];

      // attributes에 추가 정보가 있으면 표시
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          if (key === 'timestamp') return;
          if (typeof value === 'object') {
            facts.push({ name: key, value: JSON.stringify(value) });
          } else {
            facts.push({ name: key, value: String(value) });
          }
        });
      }

      return {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        themeColor: info.color,
        summary: `Apple: ${info.label}`,
        sections: [{
          activityTitle: `🍎 App Store Connect: ${info.label}`,
          activitySubtitle: ts,
          facts,
        }],
      };
    }

    return null;
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
