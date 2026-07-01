const {clearCookie, requireMethod} = require('../_lib/security');
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  clearCookie(res, 'atm_admin');
  res.status(200).json({ok: true});
};
