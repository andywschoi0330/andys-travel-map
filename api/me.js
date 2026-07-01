const {getUserSession} = require('./_lib/security');
module.exports = async function handler(req, res) {
  try {
    const session = getUserSession(req);
    if (!session) return res.status(401).json({error: '로그인이 필요합니다.'});
    res.status(200).json({ok: true, user: {username: session.username, userId: session.sub}});
  } catch (e) {
    res.status(401).json({error: '로그인이 필요합니다.'});
  }
};
