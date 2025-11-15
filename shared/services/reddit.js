const fetch = require('node-fetch');
const config = require('../config');
const logger = require('../logger');

async function getAccessToken(refreshToken) {
  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${config.REDDIT_CLIENT_ID}:${config.REDDIT_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.USER_AGENT,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error);
  return tokenData.access_token;
}

async function upvote(accessToken, fullname) {
  const voteRes = await fetch('https://oauth.reddit.com/api/vote', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': config.USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ id: fullname, dir: '1' }),
  });
  const raw = await voteRes.text();
  return raw || 'ok';
}

async function comment(accessToken, parentFullname, text) {
  const commentRes = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': config.USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ thing_id: parentFullname, text, api_type: 'json' }),
  });
  return commentRes.json();
}

async function submit(accessToken, subreddit, title, text, url) {
  const isLink = !!url;
  const params = new URLSearchParams({ sr: subreddit, title, kind: isLink ? 'link' : 'self', api_type: 'json' });
  if (isLink) params.append('url', url); else params.append('text', text || '');
  const postRes = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': config.USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  return postRes.json();
}

function normalizeRedditURL(url) {
  try {
    const urlObj = new URL(url);
    urlObj.search = '';
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (parts[0] === 'u' && parts[2] === 's') {
      return `https://redd.it/${parts[3]}`;
    }
    return urlObj.toString();
  } catch (err) {
    throw new Error('Invalid URL: ' + err.message);
  }
}

function getFullnameFromURL(url) {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  if (parts[0] === 'r' && parts[2] === 'comments') {
    const postID = parts[3];
    if (parts.length > 6 && parts[6]) {
      return { fullname: `t1_${parts[6]}`, type: 'comment' };
    } else {
      return { fullname: `t3_${postID}`, type: 'post' };
    }
  }
  if (parts[0] === 'user' && parts[2] === 'comments') {
    const postID = parts[3];
    return { fullname: `t3_${postID}`, type: 'post' };
  }
  throw new Error('Cannot parse Reddit URL');
}

module.exports = { getAccessToken, upvote, comment, submit, normalizeRedditURL, getFullnameFromURL };