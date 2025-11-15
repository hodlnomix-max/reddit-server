const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // npm install node-fetch@2
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(bodyParser.json());

// ------------------ CONFIG ------------------
const REDDIT_CLIENT_ID = 'VE8vGJvHmd4Yi7N99p_tPQ';
const REDDIT_CLIENT_SECRET = 'BbqmJkj6_tAGNrrkwknrhoPDvhnxHg';
const REDDIT_REDIRECT_URI = 'https://reddit-server-production.up.railway.app/auth/callback';
const REDDIT_REDIRECT_URI_UP = process.env.REDDIT_REDIRECT_URI_UP || 'https://reddit-server-production.up.railway.app/auth/callback/up-accounts';
const USER_AGENT = 'MyTestApp/1.0 by YourRedditUsername';
const PORT = 3000;

// file to persist accounts
const ACCOUNTS_FILE = path.join(__dirname, '..', 'accounts.json');
const UP_ACCOUNTS_FILE = path.join(__dirname, '..', 'up-accounts.json');

// ------------------ IN-MEMORY STORE (loaded from file) ------------------
// Structure: { "<username>": { refreshToken, connectedAt, note? } }
let accounts = {};
let upAccounts = {};

// load accounts from file if exists
async function loadAccountsFromFile() {
  try {
    const raw = await fs.readFile(ACCOUNTS_FILE, 'utf8');
    accounts = JSON.parse(raw);
    console.log(`Loaded ${Object.keys(accounts).length} account(s) from ${ACCOUNTS_FILE}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // file doesn't exist — start with empty
      accounts = {};
      console.log('No accounts.json found — starting with empty store.');
    } else {
      console.error('Failed to load accounts file:', err);
      accounts = {};
    }
  }
}

async function loadUpAccountsFromFile() {
  try {
    const raw = await fs.readFile(UP_ACCOUNTS_FILE, 'utf8');
    upAccounts = JSON.parse(raw);
    console.log(`Loaded ${Object.keys(upAccounts).length} up-account(s) from ${UP_ACCOUNTS_FILE}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      upAccounts = {};
      console.log('No up-accounts.json found — starting with empty store.');
    } else {
      console.error('Failed to load up-accounts file:', err);
      upAccounts = {};
    }
  }
}

// atomic save to file
async function saveAccountsToFile() {
  try {
    const tmp = ACCOUNTS_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(accounts, null, 2), 'utf8');
    await fs.rename(tmp, ACCOUNTS_FILE);
    // console.log('Saved accounts to', ACCOUNTS_FILE);
  } catch (err) {
    console.error('Failed to save accounts file:', err);
  }
}

async function saveUpAccountsToFile() {
  try {
    const tmp = UP_ACCOUNTS_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(upAccounts, null, 2), 'utf8');
    await fs.rename(tmp, UP_ACCOUNTS_FILE);
  } catch (err) {
    console.error('Failed to save up-accounts file:', err);
  }
}

// initialize store
loadAccountsFromFile().catch(err => console.error(err));
loadUpAccountsFromFile().catch(err => console.error(err));

// ------------------ 1️⃣ OAuth URL ------------------
app.get('/auth/url', (req, res) => {
    const state = Math.random().toString(36).slice(2);
    const scope = encodeURIComponent('identity submit read vote');
    const url = `https://www.reddit.com/api/v1/authorize?client_id=${REDDIT_CLIENT_ID}` +
        `&response_type=code&state=${state}` +
        `&redirect_uri=${encodeURIComponent(REDDIT_REDIRECT_URI)}` +
        `&duration=permanent&scope=${scope}`;
    res.json({ url });
});

app.get('/auth/url/up-accounts', (req, res) => {
    const state = 'up-' + Math.random().toString(36).slice(2);
    const scope = encodeURIComponent('identity submit read vote');
    const url = `https://www.reddit.com/api/v1/authorize?client_id=${REDDIT_CLIENT_ID}` +
        `&response_type=code&state=${state}` +
        `&redirect_uri=${encodeURIComponent(REDDIT_REDIRECT_URI)}` +
        `&duration=permanent&scope=${scope}`;
    res.json({ url });
});

// ------------------ 2️⃣ OAuth callback ------------------
app.get('/auth/callback', async (req, res) => {
    const { code, error, state } = req.query;
    if (error) return res.send('OAuth error: ' + error);
    if (!code) return res.send('Missing code');

    try {
        // Exchange code for access + refresh token
        const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': USER_AGENT
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDDIT_REDIRECT_URI
            })
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) return res.send('OAuth callback failed: ' + tokenData.error);

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        if (!refreshToken) {
          // sometimes reddit won't return refresh token if duration != permanent or scopes wrong
          return res.send('No refresh token returned. Make sure you used duration=permanent and requested scopes.');
        }

        // Get account username
        const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
            headers: {
                'Authorization': `bearer ${accessToken}`,
                'User-Agent': USER_AGENT
            }
        });

        const me = await meRes.json();
        const username = me && me.name ? me.name : ('unknown_' + Date.now());

        // store into memory and persistence file
        const target = (state && String(state).startsWith('up-')) ? 'up' : 'normal';
        if (target === 'up') {
          upAccounts[username] = {
            refreshToken,
            connectedAt: new Date().toISOString(),
            id: me && me.id ? me.id : null
          };
          await saveUpAccountsToFile();
          console.log(`Connected and saved upvote account: ${username}`);
          res.send(`✅ Connected upvote account: ${username}\nSaved refresh token. You can close this window.`);
        } else {
          accounts[username] = {
            refreshToken,
            connectedAt: new Date().toISOString(),
            id: me && me.id ? me.id : null
          };
          await saveAccountsToFile();
          console.log(`Connected and saved account: ${username}`);
          res.send(`✅ Connected account: ${username}\nSaved refresh token. You can close this window.`);
        }
    } catch (err) {
        console.error(err);
        res.send('OAuth callback failed');
    }
});

app.get('/auth/callback/up-accounts', async (req, res) => {
    const { code, error } = req.query;
    if (error) return res.send('OAuth error: ' + error);
    if (!code) return res.send('Missing code');

    try {
        const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': USER_AGENT
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: 'http://localhost:3000/auth/callback/up-accounts'
            })
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) return res.send('OAuth callback failed: ' + tokenData.error);

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        if (!refreshToken) {
          return res.send('No refresh token returned. Make sure you used duration=permanent and requested scopes.');
        }

        const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
            headers: { 'Authorization': `bearer ${accessToken}`, 'User-Agent': USER_AGENT }
        });
        const me = await meRes.json();
        const username = me && me.name ? me.name : ('unknown_' + Date.now());

        upAccounts[username] = {
          refreshToken,
          connectedAt: new Date().toISOString(),
          id: me && me.id ? me.id : null
        };

        await saveUpAccountsToFile();

        console.log(`Connected and saved upvote account: ${username}`);
        res.send(`✅ Connected upvote account: ${username}\nSaved refresh token. You can close this window.`);
    } catch (err) {
        console.error(err);
        res.send('OAuth callback failed');
    }
});

// ------------------ Helper: get access token from refresh token ------------------
async function getAccessToken(refreshToken) {
    const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error);
    return tokenData.access_token;
}

// ------------------ 3️⃣ Submit a post ------------------
app.post('/post', async (req, res) => {
    try {
        const { refresh_token, subreddit, title, text } = req.body;
        if (!refresh_token || !subreddit || !title) return res.status(400).send('Missing fields');

        const accessToken = await getAccessToken(refresh_token);

        const postRes = await fetch('https://oauth.reddit.com/api/submit', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                sr: subreddit,
                title,
                text: text || '',
                kind: 'self'
            })
        });

        const postData = await postRes.json();
        res.json(postData);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// ------------------ 4️⃣ Submit a comment ------------------
app.post('/comment', async (req, res) => {
    try {
        const { refresh_token, parentFullname, text } = req.body;
        if (!refresh_token || !parentFullname || !text) return res.status(400).send('Missing fields');

        const accessToken = await getAccessToken(refresh_token);

        const commentRes = await fetch('https://oauth.reddit.com/api/comment', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                thing_id: parentFullname,
                text,
                api_type: 'json'
            })
        });

        const commentData = await commentRes.json();
        res.json(commentData);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// ------------------ 5️⃣ Upvote endpoint ------------------
app.post('/upvote', async (req, res) => {
  try {
    const { refresh_token, fullname } = req.body;
    if (!refresh_token || !fullname) return res.status(400).send('Missing fields');

    const accessToken = await getAccessToken(refresh_token);

    const voteRes = await fetch('https://oauth.reddit.com/api/vote', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        id: fullname,
        dir: '1' // 1 = upvote
      })
    });

    const voteData = await voteRes.text(); // reddit often returns empty body for votes
    res.json({ status: 'ok', raw: voteData });
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

// ------------------ 6️⃣ List accounts (loads from memory) ------------------
app.get('/accounts', (req, res) => {
  res.json({ accounts, upAccounts });
});

// ------------------ 7️⃣ Manually add a refresh token (optional) ------------------
// POST /add-token { "refresh_token": "...", "note": "friend1" }
app.post('/add-token', async (req, res) => {
  try {
    const { refresh_token, note } = req.body;
    if (!refresh_token) return res.status(400).send('Missing refresh_token');

    // get username via access token
    const accessToken = await getAccessToken(refresh_token);
    const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
      headers: { 'Authorization': `bearer ${accessToken}`, 'User-Agent': USER_AGENT }
    });
    const me = await meRes.json();
    const username = me && me.name ? me.name : ('unknown_' + Date.now());

    accounts[username] = {
      refreshToken: refresh_token,
      connectedAt: new Date().toISOString(),
      note: note || null,
      id: me && me.id ? me.id : null
    };

    await saveAccountsToFile();
    res.json({ status: 'saved', username });
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('GET /auth/url -> get OAuth URL');
    console.log('GET /accounts -> list saved accounts');
});
