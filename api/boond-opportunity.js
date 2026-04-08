import crypto from 'crypto';

function buildBoondJWT(clientToken, clientKey, userToken) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: clientToken,
    sub: userToken,
    iat: Math.floor(Date.now() / 1000),
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', clientKey)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export default async function handler(req, res) {
  const { BOOND_BASE_URL, BOOND_CLIENT_TOKEN, BOOND_CLIENT_KEY, BOOND_USER_TOKEN } = process.env;
  const opportunityId = req.query.id || '1269';

  const jwt = buildBoondJWT(BOOND_CLIENT_TOKEN, BOOND_CLIENT_KEY, BOOND_USER_TOKEN);
  const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  const results = {};

  // Test 1 : fiche principale de l'opportunity
  try {
    const r = await fetch(`${BOOND_BASE_URL}/opportunities/${opportunityId}`, { headers });
    const json = await r.json();
    results['opportunities/{id}'] = {
      status: r.status,
      data: json,
    };
  } catch (e) {
    results['opportunities/{id}'] = { error: e.message };
  }

  // Test 2 : actions de l'opportunity (notes, descriptions)
  try {
    const r = await fetch(`${BOOND_BASE_URL}/opportunities/${opportunityId}/actions`, { headers });
    const json = await r.json();
    results['opportunities/{id}/actions'] = {
      status: r.status,
      data: json,
    };
  } catch (e) {
    results['opportunities/{id}/actions'] = { error: e.message };
  }

  // Test 3 : information de l'opportunity
  try {
    const r = await fetch(`${BOOND_BASE_URL}/opportunities/${opportunityId}/information`, { headers });
    const json = await r.json();
    results['opportunities/{id}/information'] = {
      status: r.status,
      data: json,
    };
  } catch (e) {
    results['opportunities/{id}/information'] = { error: e.message };
  }

  // Test 4 : positionings liés
  try {
    const r = await fetch(`${BOOND_BASE_URL}/opportunities/${opportunityId}/positionings`, { headers });
    const json = await r.json();
    results['opportunities/{id}/positionings'] = {
      status: r.status,
      data: json,
    };
  } catch (e) {
    results['opportunities/{id}/positionings'] = { error: e.message };
  }

  res.status(200).json({ opportunityId, results });
}
