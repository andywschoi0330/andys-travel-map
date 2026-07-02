const {hashPassword} = require('../api/_lib/security');
const password = process.argv[2];
if (!password) {
  console.error('사용법: node scripts/hash-password.js "관리자비밀번호"');
  process.exit(1);
}
hashPassword(password).then(hash => console.log(hash));
