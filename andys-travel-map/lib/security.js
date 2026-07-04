const crypto = require('crypto');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validatePassword(password) {
  const value = String(password || '');
  return {
    ok: value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value) && /[!@#$%^&*()_\-+=?]/.test(value),
    length: value.length >= 8,
    letter: /[A-Za-z]/.test(value),
    number: /\d/.test(value),
    special: /[!@#$%^&*()_\-+=?]/.test(value)
  };
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signSession(payload, secret, maxAgeSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = {alg: 'HS256', typ: 'JWT'};
  const body = {...payload, iat: now, exp: now + maxAgeSeconds};
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySession(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  const got = Buffer.from(s);
  const exp = Buffer.from(expected);
  if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return null;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : '';
}

function setSessionCookie(res, name, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function clearCookie(res, name) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function getEncryptionKey() {
  const raw = process.env.PASSWORD_ENCRYPTION_KEY || '';
  if (!raw) throw new Error('PASSWORD_ENCRYPTION_KEY is missing');
  try {
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch {}
  return crypto.createHash('sha256').update(raw).digest();
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const N = 16384, r = 8, p = 1, keylen = 32;
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, {N, r, p}, (err, key) => err ? reject(err) : resolve(key));
  });
  return `scrypt$${N}$${r}$${p}$${salt}$${derived.toString('base64url')}`;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const keylen = Buffer.from(hash, 'base64url').length;
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, {N: Number(n), r: Number(r), p: Number(p)}, (err, key) => err ? reject(err) : resolve(key));
  });
  const expected = Buffer.from(hash, 'base64url');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-256-gcm:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptPassword(payload) {
  const [kind, ivB64, tagB64, dataB64] = String(payload || '').split(':');
  if (kind !== 'aes-256-gcm') throw new Error('Unsupported encrypted password format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

function getUserSession(req) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is missing');
  return verifySession(getCookie(req, 'atm_session'), secret);
}

function getAdminSession(req) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is missing');
  const payload = verifySession(getCookie(req, 'atm_admin'), secret);
  return payload?.role === 'admin' ? payload : null;
}

function requireMethod(req, res, method) {
  if (req.method !== method) {
    res.status(405).json({error: '허용되지 않는 요청 방식입니다.'});
    return false;
  }
  return true;
}

module.exports = {
  parseBody, normalizeUsername, validatePassword,
  signSession, verifySession, getCookie, setSessionCookie, clearCookie,
  hashPassword, verifyPassword, encryptPassword, decryptPassword,
  getUserSession, getAdminSession, requireMethod
};
