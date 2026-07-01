const {parseBody, getUserSession, requireMethod} = require('./_lib/security');
const {upsertJson, getJson, putJson} = require('./_lib/github');
module.exports = async function handler(req, res) {
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
};
