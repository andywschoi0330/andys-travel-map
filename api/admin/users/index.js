const {getAdminSession} = require('../../_lib/security');
const {getJson} = require('../../_lib/github');
module.exports = async function handler(req, res) {
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
};
