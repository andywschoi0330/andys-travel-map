const {parseBody, normalizeUsername, verifyPassword, signSession, setSessionCookie, requireMethod} = require('./_lib/security');
const {getJson, appendAdminLog} = require('./_lib/github');

module.exports = async function handler(req, res) {
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
};
