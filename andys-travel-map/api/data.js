const { handleLoadData, handleSaveData } = require('../lib/apiHandlers');
module.exports = async function handler(req, res) {
  if (req.method === 'GET') return handleLoadData(req, res);
  if (req.method === 'POST') return handleSaveData(req, res);
  return res.status(405).json({error: '허용되지 않는 요청 방식입니다.'});
};
