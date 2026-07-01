const {parseBody, normalizeUsername, validatePassword, hashPassword, encryptPassword, requireMethod} = require('./_lib/security');
const {getJson, putJson, updateJsonWithShaRetry, appendAdminLog} = require('./_lib/github');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
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
    let created = false;

    await updateJsonWithShaRetry('users/index.json', {}, async index => {
      const next = index && typeof index === 'object' && !Array.isArray(index) ? {...index} : {};
      if (next[normalized]) {
        const err = new Error('이미 사용 중인 아이디입니다.');
        err.status = 409;
        throw err;
      }
      next[normalized] = userId;
      created = true;
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
};
