const crypto = require('crypto');
const {
  parseBody, normalizeUsername, validatePassword,
  signSession, setSessionCookie, clearCookie,
  hashPassword, verifyPassword, encryptPassword, decryptPassword,
  getUserSession, getAdminSession, requireMethod
} = require('./security');
const {
  getJson, putJson, upsertJson, updateJsonWithShaRetry,
  deleteContent, appendAdminLog
} = require('./github');

function sendNotFound(res) {
  return res.status(404).json({error: '요청한 API를 찾지 못했습니다.'});
}

function getSegments(req) {
  const queryPath = req.query?.path;
  const rawPath = Array.isArray(queryPath) ? queryPath.join('/') : queryPath;
  if (rawPath) {
    return String(rawPath)
      .split('/')
      .filter(Boolean)
      .map(part => decodeURIComponent(part));
  }
  const url = new URL(req.url || '/', 'https://andys-travel-map.local');
  return url.pathname
    .replace(/^\/api\/?/, '')
    .replace(/^index\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(part => decodeURIComponent(part));
}

const ALLOWED_NATIONALITIES = new Set(['AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW']);

function normalizeNickname(nickname) {
  return String(nickname || '').trim();
}

function normalizeNicknameKey(nickname) {
  return normalizeNickname(nickname).toLowerCase();
}

function normalizeDisplayName(name) {
  return String(name || '').trim();
}

function normalizeNationality(nationality) {
  const code = String(nationality || '').trim().toUpperCase();
  if (!code) return '';
  if (!ALLOWED_NATIONALITIES.has(code)) {
    const err = new Error('선택할 수 없는 국적입니다.');
    err.status = 400;
    throw err;
  }
  return code;
}

function normalizeProfileNationality(nationality) {
  const code = String(nationality || '').trim().toUpperCase();
  return ALLOWED_NATIONALITIES.has(code) ? code : '';
}

function publicUserFromProfile(profile = {}, fallback = {}) {
  return {
    username: profile.username || fallback.username || '',
    userId: profile.userId || fallback.userId || fallback.sub || '',
    nickname: normalizeNickname(profile.nickname),
    name: normalizeDisplayName(profile.name),
    nationality: normalizeProfileNationality(profile.nationality)
  };
}

async function ensureNicknameAvailable(nicknameKey, indexData, excludeUserId = '') {
  if (!nicknameKey) return;
  for (const [username, userId] of Object.entries(indexData || {})) {
    if (excludeUserId && userId === excludeUserId) continue;
    const profile = await getJson(`users/${userId}/profile.json`, null);
    const existingNicknameKey = normalizeNicknameKey(profile.data?.nickname || '');
    if (existingNicknameKey && existingNicknameKey === nicknameKey) {
      const err = new Error('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.');
      err.status = 409;
      err.username = username;
      throw err;
    }
  }
}

async function handleRegister(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const {username, password, confirmPassword, nickname, name, nationality} = parseBody(req);
    const normalized = normalizeUsername(username);
    const cleanNickname = normalizeNickname(nickname);
    const cleanName = normalizeDisplayName(name);
    const cleanNationality = normalizeNationality(nationality);
    const nicknameKey = normalizeNicknameKey(cleanNickname);

    if (!cleanNickname) return res.status(400).json({error: '닉네임을 입력해 주세요.'});
    if (!normalized) return res.status(400).json({error: '아이디를 입력해 주세요.'});
    if (String(password || '') !== String(confirmPassword || '')) return res.status(400).json({error: '비밀번호가 일치하지 않습니다.'});
    if (!validatePassword(password).ok) return res.status(400).json({error: '비밀번호는 8자 이상이며, 영문 알파벳, 숫자, 특수기호를 각각 1개 이상 포함해야 합니다.'});

    const indexFile = await getJson('users/index.json', {});
    const indexData = indexFile.data && typeof indexFile.data === 'object' && !Array.isArray(indexFile.data) ? indexFile.data : {};
    if (indexData[normalized]) return res.status(409).json({error: '이미 사용 중인 아이디입니다.'});
    await ensureNicknameAvailable(nicknameKey, indexData);

    const userId = `user_${crypto.randomBytes(12).toString('base64url')}`;
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(String(password));
    const encryptedPassword = encryptPassword(String(password));

    await updateJsonWithShaRetry('users/index.json', {}, async index => {
      const next = index && typeof index === 'object' && !Array.isArray(index) ? {...index} : {};
      if (next[normalized]) {
        const err = new Error('이미 사용 중인 아이디입니다.');
        err.status = 409;
        throw err;
      }
      next[normalized] = userId;
      return next;
    }, `register user ${normalized}`);

    const profile = {
      username: normalized,
      userId,
      nickname: cleanNickname,
      name: cleanName,
      nationality: cleanNationality,
      passwordHash,
      encryptedPassword,
      createdAt: now,
      updatedAt: now
    };
    await putJson(`users/${userId}/profile.json`, profile, `create profile ${normalized}`, null);
    await appendAdminLog({type: 'register', username: normalized, userId});
    res.status(200).json({ok: true, user: publicUserFromProfile(profile)});
  } catch (e) {
    if (e.message === '이미 사용 중인 아이디입니다.' || e.message === '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.') return res.status(e.status || 409).json({error: e.message});
    console.error(e);
    res.status(e.status || 500).json({error: e.message || '회원가입에 실패했습니다.'});
  }
}

async function handleLogin(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const {username, password} = parseBody(req);
    const normalized = normalizeUsername(username);
    const index = await getJson('users/index.json', {});
    const userId = index.data?.[normalized];
    if (!userId) return res.status(401).json({error: '아이디 또는 비밀번호가 올바르지 않습니다.'});
    const profile = await getJson(`users/${userId}/profile.json`, null);
    if (!profile.exists || !(await verifyPassword(String(password || ''), profile.data.passwordHash))) {
      await appendAdminLog({type: 'login_failed', username: normalized});
      return res.status(401).json({error: '아이디 또는 비밀번호가 올바르지 않습니다.'});
    }
    const user = publicUserFromProfile(profile.data, {username: normalized, userId});
    const token = signSession({sub: userId, username: normalized, role: 'user'}, process.env.JWT_SECRET, 60 * 60 * 24 * 14);
    setSessionCookie(res, 'atm_session', token, 60 * 60 * 24 * 14);
    await appendAdminLog({type: 'login', username: normalized, userId});
    res.status(200).json({ok: true, user});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '로그인에 실패했습니다.'});
  }
}

async function handleMe(req, res) {
  try {
    const session = getUserSession(req);
    if (!session) return res.status(401).json({error: '로그인이 필요합니다.'});
    const profile = await getJson(`users/${session.sub}/profile.json`, null);
    const user = publicUserFromProfile(profile.data || {}, {username: session.username, userId: session.sub});
    res.status(200).json({ok: true, user});
  } catch (e) {
    res.status(401).json({error: '로그인이 필요합니다.'});
  }
}

async function handleLoadData(req, res) {
  try {
    const session = getUserSession(req);
    if (!session) return res.status(401).json({error: '로그인이 필요합니다.'});
    const file = await getJson(`data/${session.sub}/app-data.json`, null);
    if (!file.exists) return res.status(200).json({exists: false, data: null});
    res.status(200).json({exists: true, data: file.data});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '데이터를 불러오지 못했습니다.'});
  }
}

async function handleSaveData(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const session = getUserSession(req);
    if (!session) return res.status(401).json({error: '로그인이 필요합니다.'});
    const {data} = parseBody(req);
    if (!data || typeof data !== 'object' || !Array.isArray(data.places)) return res.status(400).json({error: '저장할 데이터 형식이 올바르지 않습니다.'});
    const clean = {...data, updatedAt: new Date().toISOString()};
    await upsertJson(`data/${session.sub}/app-data.json`, clean, `save app data ${session.username}`);
    const profileFile = await getJson(`users/${session.sub}/profile.json`, null);
    if (profileFile.exists) {
      await putJson(`users/${session.sub}/profile.json`, {...profileFile.data, updatedAt: new Date().toISOString()}, `update profile timestamp ${session.username}`, profileFile.sha);
    }
    res.status(200).json({ok: true, updatedAt: clean.updatedAt});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '저장에 실패했습니다. 인터넷 연결을 확인해 주세요.'});
  }
}

async function handleLogout(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  clearCookie(res, 'atm_session');
  res.status(200).json({ok: true});
}

async function handleAdminLogin(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const {password} = parseBody(req);
    const ok = await verifyPassword(String(password || ''), process.env.ADMIN_PASSWORD_HASH || '');
    if (!ok) return res.status(401).json({error: '관리자 비밀번호가 올바르지 않습니다.'});
    const token = signSession({sub: 'admin', role: 'admin'}, process.env.JWT_SECRET, 60 * 60 * 4);
    setSessionCookie(res, 'atm_admin', token, 60 * 60 * 4);
    await appendAdminLog({type: 'admin_login'});
    res.status(200).json({ok: true});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '관리자 로그인에 실패했습니다.'});
  }
}

async function handleAdminLogout(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  clearCookie(res, 'atm_admin');
  res.status(200).json({ok: true});
}

async function handleAdminUsers(req, res) {
  try {
    if (!getAdminSession(req)) return res.status(401).json({error: '관리자 로그인이 필요합니다.'});
    const index = await getJson('users/index.json', {});
    const users = [];
    for (const [username, userId] of Object.entries(index.data || {})) {
      const profile = await getJson(`users/${userId}/profile.json`, null);
      const data = await getJson(`data/${userId}/app-data.json`, null);
      const profileData = profile.data || {};
      users.push({
        username, userId,
        nickname: normalizeNickname(profileData.nickname),
        name: normalizeDisplayName(profileData.name),
        nationality: normalizeProfileNationality(profileData.nationality),
        createdAt: profileData.createdAt || '',
        updatedAt: profileData.updatedAt || '',
        hasData: !!data.exists,
        passwordMasked: '••••••••'
      });
    }
    users.sort((a,b) => a.username.localeCompare(b.username));
    res.status(200).json({ok: true, users});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '계정 목록을 불러오지 못했습니다.'});
  }
}

async function handleAdminUserPassword(req, res, userId) {
  try {
    if (!getAdminSession(req)) return res.status(401).json({error: '관리자 로그인이 필요합니다.'});
    const profile = await getJson(`users/${userId}/profile.json`, null);
    if (!profile.exists) return res.status(404).json({error: '사용자를 찾지 못했습니다.'});
    const password = decryptPassword(profile.data.encryptedPassword);
    await appendAdminLog({type: 'admin_view_password', userId, username: profile.data.username});
    res.status(200).json({ok: true, password});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '비밀번호를 확인하지 못했습니다.'});
  }
}

async function handleAdminResetPassword(req, res, userId) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    if (!getAdminSession(req)) return res.status(401).json({error: '관리자 로그인이 필요합니다.'});
    const {newPassword} = parseBody(req);
    if (!validatePassword(newPassword).ok) return res.status(400).json({error: '비밀번호는 8자 이상이며, 영문 알파벳, 숫자, 특수기호를 각각 1개 이상 포함해야 합니다.'});
    const profile = await getJson(`users/${userId}/profile.json`, null);
    if (!profile.exists) return res.status(404).json({error: '사용자를 찾지 못했습니다.'});
    const next = {
      ...profile.data,
      passwordHash: await hashPassword(String(newPassword)),
      encryptedPassword: encryptPassword(String(newPassword)),
      updatedAt: new Date().toISOString()
    };
    await putJson(`users/${userId}/profile.json`, next, `admin reset password ${profile.data.username}`, profile.sha);
    await appendAdminLog({type: 'admin_reset_password', userId, username: profile.data.username});
    res.status(200).json({ok: true});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '비밀번호를 변경하지 못했습니다.'});
  }
}

async function handleAdminDeleteUser(req, res, userId) {
  if (req.method !== 'DELETE') return res.status(405).json({error: '허용되지 않는 요청 방식입니다.'});
  try {
    if (!getAdminSession(req)) return res.status(401).json({error: '관리자 로그인이 필요합니다.'});
    const {mode = 'archive'} = parseBody(req);
    const profile = await getJson(`users/${userId}/profile.json`, null);
    if (!profile.exists) return res.status(404).json({error: '사용자를 찾지 못했습니다.'});
    const username = profile.data.username;
    const data = await getJson(`data/${userId}/app-data.json`, null);
    if (mode !== 'delete') {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await putJson(`admin/archive/${userId}-${stamp}/profile.json`, profile.data, `archive profile ${username}`, null);
      if (data.exists) await putJson(`admin/archive/${userId}-${stamp}/app-data.json`, data.data, `archive app data ${username}`, null);
    }
    await updateJsonWithShaRetry('users/index.json', {}, async index => {
      const next = {...(index || {})};
      delete next[username];
      return next;
    }, `remove user ${username}`);
    await deleteContent(`users/${userId}/profile.json`, `delete profile ${username}`);
    await deleteContent(`data/${userId}/app-data.json`, `delete app data ${username}`);
    await appendAdminLog({type: mode === 'delete' ? 'admin_delete_user' : 'admin_archive_user', userId, username});
    res.status(200).json({ok: true});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '계정을 삭제하지 못했습니다.'});
  }
}


module.exports = {
  handleRegister, handleLogin, handleMe, handleLoadData, handleSaveData, handleLogout,
  handleAdminLogin, handleAdminLogout, handleAdminUsers, handleAdminUserPassword, handleAdminResetPassword, handleAdminDeleteUser
};
