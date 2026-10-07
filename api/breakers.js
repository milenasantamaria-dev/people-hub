// Vercel serverless function: returns the names (only — never emails) of
// active Breakers so hall-of-fame.html can offer them as suggestions.
// Returns an empty list when the roster isn't configured, and the page then
// simply keeps working as a free-text field.

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

export default async function handler(req, res) {
  const breakers = await loadRoster();
  const names = [...new Set(breakers.map((b) => b.name))].sort((a, b) => a.localeCompare(b));
  res.setHeader('Cache-Control', 's-maxage=300');
  res.status(200).json({ names });
}
