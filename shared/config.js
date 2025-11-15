require('dotenv').config();
const path = require('path');

const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
  REDDIT_REDIRECT_URI: process.env.REDDIT_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  USER_AGENT: process.env.USER_AGENT || 'EAuntBot/1.0 by EAunt',
  PORT: Number(process.env.PORT || 3000),
  ACCOUNTS_FILE: path.join(__dirname, '..', 'accounts.json'),
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  LOG_DIR: path.join(__dirname, '..', 'logs'),
};

module.exports = config;