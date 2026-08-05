// Vercel serverless function: receives a generated award-card PDF from
// hall-of-fame.html and uploads it to the #cheers-for-peers Slack channel
// via a bot token.
// Required env var (set in the Vercel project dashboard, never in code):
//   SLACK_BOT_TOKEN — bot token with the `files:write` scope
//
// The channel ID isn't secret, so it's hardcoded here rather than in an
// env var — #cheers-for-peers, where the Breaker Awards bot was invited.
const SLACK_CHANNEL_ID = 'C09B6UYTM7W';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { pdfBase64, filename, message } = req.body || {};
  if (!pdfBase64 || !filename) {
    res.status(400).json({ error: 'Missing pdfBase64 or filename' });
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = SLACK_CHANNEL_ID;
  if (!token) {
    res.status(500).json({ error: 'Slack is not configured on the server (missing SLACK_BOT_TOKEN)' });
    return;
  }

  try {
    const buffer = Buffer.from(pdfBase64, 'base64');

    // Step 1 — ask Slack for a short-lived upload URL.
    const urlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ filename, length: String(buffer.length) }),
    }).then((r) => r.json());

    if (!urlRes.ok) throw new Error(urlRes.error || 'files.getUploadURLExternal failed');

    // Step 2 — upload the raw PDF bytes to that URL.
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
    const uploadRes = await fetch(urlRes.upload_url, { method: 'POST', body: form });
    if (!uploadRes.ok) throw new Error('Upload to Slack storage failed');

    // Step 3 — finalize the upload and share it into the channel.
    const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: [{ id: urlRes.file_id, title: filename }],
        channel_id: channel,
        initial_comment: message || '',
      }),
    }).then((r) => r.json());

    if (!completeRes.ok) throw new Error(completeRes.error || 'files.completeUploadExternal failed');

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-to-slack error:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
