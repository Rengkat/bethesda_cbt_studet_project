// One-off script to create the first admin account.
// Run locally with:  node scripts/createAdmin.js <username> <password>
//
// This intentionally bypasses the API — there is no public admin
// registration endpoint by design. Delete or restrict this script
// after you've created the accounts you need.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const Admin = require('../models/Admin');

async function main() {
  const [, , username, password] = process.argv;

  if (!username || !password) {
    console.error('Usage: node scripts/createAdmin.js <username> <password>');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password should be at least 8 characters.');
    process.exit(1);
  }

  await connectDB();

  const existing = await Admin.findOne({ username: username.trim() });
  if (existing) {
    console.error(`Admin "${username}" already exists.`);
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await Admin.create({
    username: username.trim(),
    password: hashedPassword
  });

  console.log(`Admin created: ${admin.username} (id: ${admin._id})`);
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
