const crypto = require('crypto');
const {
  parseBody, normalizeUsername, validatePassword,
  signSession, setSessionCookie, clearCookie,
  hashPassword, verifyPassword, encryptPassword, decryptPassword,
  getUserSession, getAdminSession, requireMethod
} = require('../lib/security');
const {
  getJson, putJson, upsertJson, updateJsonWithShaRetry,
  deleteContent, appendAdminLog
} = require('../lib/github');

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

async function handleRegister(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const {username, password, confirmPassword} = parseBody(req);
    const normalized = normalizeUsername(username);
    if (!normalized) return res.status(400).json({error: '아이디를 입력해 주세요.'});
    if (String(password || '') !== String(confirmPassword || '')) return res.status(400).json({error: '비밀번호가 일치하지 않습니다.'});
    if (!validatePassword(password).ok) return res.status(400).json({error: '비밀번호는 8자 이상이며, 영문 알파벳, 숫자, 특수기호를 각각 1개 이상 포함해야 합니다.'});

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

    const profile = {username: normalized, userId, passwordHash, encryptedPassword, createdAt: now, updatedAt: now};
    await putJson(`users/${userId}/profile.json`, profile, `create profile ${normalized}`, null);
    await appendAdminLog({type: 'register', username: normalized, userId});
    res.status(200).json({ok: true, user: {username: normalized, userId}});
  } catch (e) {
    if (e.message === '이미 사용 중인 아이디입니다.') return res.status(409).json({error: e.message});
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
    const token = signSession({sub: userId, username: normalized, role: 'user'}, process.env.JWT_SECRET, 60 * 60 * 24 * 14);
    setSessionCookie(res, 'atm_session', token, 60 * 60 * 24 * 14);
    await appendAdminLog({type: 'login', username: normalized, userId});
    res.status(200).json({ok: true, user: {username: normalized, userId}});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '로그인에 실패했습니다.'});
  }
}

async function handleMe(req, res) {
  try {
    const session = getUserSession(req);
    if (!session) return res.status(401).json({error: '로그인이 필요합니다.'});
    res.status(200).json({ok: true, user: {username: session.username, userId: session.sub}});
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
      users.push({
        username, userId,
        createdAt: profile.data?.createdAt || '',
        updatedAt: profile.data?.updatedAt || '',
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

module.exports = async function handler(req, res) {
  const segments = getSegments(req);
  const route = segments.join('/');

  if (route === 'register') return handleRegister(req, res);
  if (route === 'login') return handleLogin(req, res);
  if (route === 'me') return handleMe(req, res);
  if (route === 'load-data') return handleLoadData(req, res);
  if (route === 'save-data') return handleSaveData(req, res);
  if (route === 'logout') return handleLogout(req, res);

  if (route === 'admin/login') return handleAdminLogin(req, res);
  if (route === 'admin/logout') return handleAdminLogout(req, res);
  if (route === 'admin/users') return handleAdminUsers(req, res);

  if (segments[0] === 'admin' && segments[1] === 'users' && segments[2]) {
    const userId = segments[2];
    if (segments.length === 3) return handleAdminDeleteUser(req, res, userId);
    if (segments[3] === 'password') return handleAdminUserPassword(req, res, userId);
    if (segments[3] === 'reset-password') return handleAdminResetPassword(req, res, userId);
  }

  return sendNotFound(res);
};
