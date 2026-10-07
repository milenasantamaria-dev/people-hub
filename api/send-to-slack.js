// Vercel serverless function: receives a generated award-card image from
// hall-of-fame.html and posts it to the #cheers-for-peers Slack channel,
// @-mentioning the recipient when we can match them to a Slack member.
// Required env var (set in the Vercel project dashboard, never in code):
//   SLACK_BOT_TOKEN — bot token with `files:write`, `chat:write`, and (only to
//   @-mention people) `users:read` + `users:read.email`; without them the
//   card still posts, just without a tag
//   ROSTER_SECRET   — optional; enables exact tagging by work email
//   SLACK_TEST_CHANNEL_ID — optional; private channel used by ?test=1 mode
//
// The channel ID isn't secret, so it's hardcoded here rather than in an
// env var — #cheers-for-peers, where the Breaker Awards bot was invited.
const SLACK_CHANNEL_ID = 'C09B6UYTM7W';

// Vercel's default body-parser limit is 1mb; raise it (well under the
// platform's hard ~4.5mb request-size ceiling).
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

// User-typed text goes into Slack mrkdwn; escaping &, < and > stops someone
// from injecting things like <!channel> into the message.
const slackEsc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Roster (Performance app "Breakers" tab, via the Referrals Apps Script) ──
// Needs env var ROSTER_SECRET (same value as the Apps Script property of the
// same name). Without it, roster features switch off and callers fall back.
const ROSTER_URL = 'https://script.google.com/macros/s/AKfycbzNFzM6rZ0Q8TSA_l22mnoUBkH-4PZs9DTLj9PnE75g1XOAyR_bq6vHUJnW6Nxn1WlBfQ/exec';
let rosterCache = { at: 0, breakers: [] };
async function loadRoster() {
  const key = process.env.ROSTER_SECRET;
  if (!key) return [];
  if (rosterCache.breakers.length && Date.now() - rosterCache.at < 10 * 60 * 1000) return rosterCache.breakers;
  try {
    const r = await fetch(`${ROSTER_URL}?action=breakers&key=${encodeURIComponent(key)}`).then((x) => x.json());
    if (!r.success) throw new Error(r.error || 'roster request failed');
    rosterCache = { at: Date.now(), breakers: r.breakers };
    return r.breakers;
  } catch (err) {
    console.warn('Could not load roster:', err.message);
    return [];
  }
}

let userCache = { at: 0, users: [] };
async function loadUsers(token) {
  if (userCache.users.length && Date.now() - userCache.at < 10 * 60 * 1000) return userCache.users;
  const users = [];
  let cursor = '';
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const r = await fetch(`https://slack.com/api/users.list?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((x) => x.json());
    if (!r.ok) throw new Error(r.error || 'users.list failed');
    users.push(...r.members);
    cursor = r.response_metadata?.next_cursor || '';
  } while (cursor);
  userCache = { at: Date.now(), users };
  return users;
}

// Best path: typed name -> roster -> work email -> Slack user (exact, no typos).
async function findUserIdByEmail(token, name) {
  const target = norm(name);
  if (!target) return null;
  const matches = (await loadRoster()).filter((b) => norm(b.name) === target || norm(b.preferredName) === target);
  if (matches.length !== 1) return null;
  try {
    const r = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(matches[0].email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((x) => x.json());
    return r.ok ? r.user.id : null;
  } catch (err) {
    console.warn('Email lookup failed (is users:read.email granted?):', err.message);
    return null;
  }
}

// Fallback: returns a Slack user ID only when exactly one member matches the typed name.
async function findUserId(token, name) {
  const byEmail = await findUserIdByEmail(token, name);
  if (byEmail) return byEmail;
  const target = norm(name);
  if (!target) return null;
  try {
    const users = await loadUsers(token);
    const matches = users.filter(
      (u) =>
        !u.deleted &&
        !u.is_bot &&
        u.id !== 'USLACKBOT' &&
        [u.real_name, u.profile?.real_name, u.profile?.display_name].some((n) => norm(n) === target)
    );
    return matches.length === 1 ? matches[0].id : null;
  } catch (err) {
    console.warn('Could not look up Slack users (is users:read granted?):', err.message);
    return null;
  }
}

// Slack's 3-step upload. Without `channel` the file is only uploaded (not
// posted anywhere); with it, Slack posts the file plus `comment` to the channel.
async function uploadFile(token, buffer, filename, mime, channel, comment) {
  const urlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ filename, length: String(buffer.length) }),
  }).then((r) => r.json());
  if (!urlRes.ok) throw new Error(urlRes.error || 'files.getUploadURLExternal failed');

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);
  const uploadRes = await fetch(urlRes.upload_url, { method: 'POST', body: form });
  if (!uploadRes.ok) throw new Error('Upload to Slack storage failed');

  const body = { files: [{ id: urlRes.file_id, title: filename }] };
  if (channel) {
    body.channel_id = channel;
    body.initial_comment = comment || '';
  }
  const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
  if (!completeRes.ok) throw new Error(completeRes.error || 'files.completeUploadExternal failed');

  return urlRes.file_id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { imageBase64, filename, title, breakerName, nominator, recognition, test } = req.body || {};
  if (!imageBase64 || !filename) {
    res.status(400).json({ error: 'Missing imageBase64 or filename' });
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Slack is not configured on the server (missing SLACK_BOT_TOKEN)' });
    return;
  }

  // Test mode (hall-of-fame.html?test=1) posts to a private test channel instead
  // of the team channel. If that channel isn't configured it refuses outright
  // rather than falling back to the real one.
  const channel = test ? process.env.SLACK_TEST_CHANNEL_ID : SLACK_CHANNEL_ID;
  if (!channel) {
    res.status(400).json({ error: 'Test channel not configured (missing SLACK_TEST_CHANNEL_ID)' });
    return;
  }

  try {
    const buffer = Buffer.from(imageBase64, 'base64');
    const userId = await findUserId(token, breakerName);
    const who = userId ? `<@${userId}>` : `*${slackEsc(breakerName) || 'a Breaker'}*`;
    let text = `${test ? '🧪 *[TEST]* ' : ''}🏆 *${slackEsc(title) || 'Breaker Award'}* nomination for ${who}, submitted by ${slackEsc(nominator) || 'Anonymous'}.`;
    // The written recognition goes in the message itself (as a quote) so it's
    // readable in the channel without opening the card image.
    const note = String(recognition || '').trim().slice(0, 2000);
    if (note) text += '\n' + slackEsc(note).split('\n').map((l) => `> ${l}`).join('\n');
    const altText = `${title || 'Breaker Award'} card for ${breakerName || 'a Breaker'}`.slice(0, 250);

    // Preferred: upload privately, then post a message whose image block shows
    // the card full-size inline (no click needed). Slack needs a moment to
    // process a fresh upload, so retry a few times.
    let posted = false;
    try {
      const fileId = await uploadFile(token, buffer, filename, 'image/png');
      let lastError = '';
      for (let attempt = 0; attempt < 4 && !posted; attempt++) {
        if (attempt) await sleep(1200);
        const r = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel,
            text,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text } },
              { type: 'image', slack_file: { id: fileId }, alt_text: altText },
            ],
          }),
        }).then((x) => x.json());
        if (r.ok) posted = true;
        else lastError = r.error;
      }
      if (!posted) throw new Error(lastError || 'chat.postMessage failed');
    } catch (err) {
      console.warn('Inline image post failed, falling back to a plain file share:', err.message);
    }

    // Fallback: share the file straight into the channel with the same text.
    if (!posted) await uploadFile(token, buffer, filename, 'image/png', channel, text);

    res.status(200).json({ ok: true, tagged: Boolean(userId) });
  } catch (err) {
    console.error('send-to-slack error:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
