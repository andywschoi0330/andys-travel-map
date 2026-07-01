const {getUserSession} = require('./_lib/security');
const {getJson} = require('./_lib/github');
module.exports = async function handler(req, res) {
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
};
