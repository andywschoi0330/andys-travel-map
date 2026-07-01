const {parseBody, verifyPassword, signSession, setSessionCookie, requireMethod} = require('../_lib/security');
const {appendAdminLog} = require('../_lib/github');
module.exports = async function handler(req, res) {
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
};
