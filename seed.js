// Run once with: npm run seed
// Creates the first admin account using values from .env
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const Admin = require('./models/Admin');

async function seed() {
  await connectDB();

  const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

  const existing = await Admin.findOne({ username });
  if (existing) {
    console.log(`Admin "${username}" already exists. Nothing to do.`);
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await Admin.create({ username, password: hashedPassword });

  console.log(`Admin account created — username: "${username}", password: "${password}"`);
  console.log('Please log in and remember to keep these credentials safe.');
  process.exit(0);
}

seed();
