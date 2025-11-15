const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

let store = {};

async function load() {
  try {
    const raw = await fs.readFile(config.ACCOUNTS_FILE, 'utf8');
    store = JSON.parse(raw);
  } catch (err) {
    store = {};
  }
}

async function save() {
  try {
    const tmp = config.ACCOUNTS_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tmp, config.ACCOUNTS_FILE);
  } catch (_) {}
}

function set(username, data) {
  store[username] = data;
}

function count() {
  return Object.keys(store).length;
}

function getEntries() {
  return Object.entries(store).map(([username, v]) => ({ username, token: v.refreshToken }));
}

async function getEntriesFrom(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const obj = JSON.parse(raw);
    return Object.entries(obj).map(([username, v]) => ({ username, token: v.refreshToken }));
  } catch (_) {
    return [];
  }
}

module.exports = { load, save, set, count, getEntries, getEntriesFrom };