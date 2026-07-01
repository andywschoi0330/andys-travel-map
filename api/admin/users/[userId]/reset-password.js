const {parseBody, getAdminSession, validatePassword, hashPassword, encryptPassword, requireMethod} = require('../../../_lib/security');
const {getJson, putJson, appendAdminLog} = require('../../../_lib/github');
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    if (!getAdminSession(req)) return res.status(401).json({error: '관리자 로그인이 필요합니다.'});
    const {userId} = req.query;
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
};
