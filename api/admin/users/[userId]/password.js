const {getAdminSession, decryptPassword} = require('../../../_lib/security');
const {getJson, appendAdminLog} = require('../../../_lib/github');
module.exports = async function handler(req, res) {
  try {
    if (!getAdminSession(req)) return res.status(401).json({error: '관리자 로그인이 필요합니다.'});
    const {userId} = req.query;
    const profile = await getJson(`users/${userId}/profile.json`, null);
    if (!profile.exists) return res.status(404).json({error: '사용자를 찾지 못했습니다.'});
    const password = decryptPassword(profile.data.encryptedPassword);
    await appendAdminLog({type: 'admin_view_password', userId, username: profile.data.username});
    res.status(200).json({ok: true, password});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: '비밀번호를 확인하지 못했습니다.'});
  }
};
