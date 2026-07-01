const {parseBody, getAdminSession, requireMethod} = require('../../_lib/security');
const {getJson, putJson, updateJsonWithShaRetry, deleteContent, appendAdminLog} = require('../../_lib/github');
module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({error: '허용되지 않는 요청 방식입니다.'});
  try {
    if (!getAdminSession(req)) return res.status(401).json({error: '관리자 로그인이 필요합니다.'});
    const {userId} = req.query;
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
};
