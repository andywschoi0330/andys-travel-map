const {
  handleAdminLogin, handleAdminLogout, handleAdminUsers,
  handleAdminUserPassword, handleAdminResetPassword, handleAdminDeleteUser
} = require('../lib/apiHandlers');

module.exports = async function handler(req, res) {
  const action = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;
  const userId = Array.isArray(req.query?.userId) ? req.query.userId[0] : req.query?.userId;

  if (action === 'login') return handleAdminLogin(req, res);
  if (action === 'logout') return handleAdminLogout(req, res);
  if (action === 'users') return handleAdminUsers(req, res);
  if (action === 'password' && userId) return handleAdminUserPassword(req, res, userId);
  if (action === 'reset-password' && userId) return handleAdminResetPassword(req, res, userId);
  if (action === 'delete-user' && userId) return handleAdminDeleteUser(req, res, userId);

  return res.status(404).json({error: '요청한 관리자 API를 찾지 못했습니다.'});
};
