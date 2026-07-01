const {clearCookie, requireMethod} = require('./_lib/security');
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  clearCookie(res, 'atm_session');
  res.status(200).json({ok: true});
};
