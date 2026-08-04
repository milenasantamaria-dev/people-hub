# Daybreak People Ops — Claude Code Handoff Document

## Who is this for
This document is a full handoff for **Claude Code** to continue building the Daybreak People Ops web suite. It was built in Claude.ai by Mile (Ana Milena Santamaria Novoa), Head of People at Daybreak AI.

---

## Project Overview

Three HTML files that form the Daybreak internal People Ops web suite. They are standalone HTML files (no framework, no build step) intended to be deployed on **Vercel** as static files.

### Files

| File | Purpose | Status |
|---|---|---|
| `index.html` (rename from `daybreak_people_hub.html`) | People Hub landing page | Ready for Vercel |
| `daybreak_recognition_cards.html` | Hall of Fame — Breaker Awards card generator | Ready for Vercel |
| `daybreak_awards_admin.html` | Admin report for nominations (password protected) | Ready for Vercel |

---

## Daybreak Brand Guidelines

- **Primary green:** `#2D9B4E`
- **Bright green:** `#3DBA61`
- **Light green tint:** `#E8F5EC`
- **Mid green:** `#B6DEC3`
- **Near-black text:** `#1C1C1C`
- **Body font:** DM Sans (Google Fonts)
- **Logo:** Embedded as base64 PNG in all files. Green circle with two-tone green (lighter top, darker bottom) and white sunrise semicircle. Text "daybreak" in dark rounded sans-serif. When on dark backgrounds the logo was processed to remove white bg and turn black text white.
- **CRITICAL RULE:** Never use hyphens/dashes in visible text content (Tim Krug, CEO, detests them). Use periods, commas, or just spaces instead.
- **No em dashes, no en dashes, no hyphens** in any user-facing text.

---

## File 1: People Hub (`daybreak_people_hub.html` → `index.html`)

### What it is
The main landing page for all People Ops tools. White/green light mode, sticky navbar, interactive world map, feature cards grid.

### Tech stack
- Pure HTML/CSS/JS — no framework
- **Leaflet.js** (CDN) for interactive world map
- Google Fonts (DM Sans)
- No build step needed

### Navbar sections (sticky, smooth scroll, auto-highlights on scroll)
1. 📍 Locations
2. ⚾ Hall of Fame
3. 🔄 Performance
4. 🙋 Staff Support
5. 📋 Recruitment
6. 🎤 Surveys
7. 🏥 Benefits
8. 🗺️ Org Design
9. 🚀 Onboarding

### Map
- Leaflet.js with CartoDB light tiles (`light_nolabels`)
- GeoJSON from: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson`
- **Active (green) countries:** United States of America, Canada, India, Colombia, Costa Rica
- Has a fallback UI with country flag pills if GeoJSON fetch fails

### Feature cards — Live (green accent bar at bottom)
| Card | Icon | Tags |
|---|---|---|
| Hall of Fame | ⚾ | Recognition, Culture, PDF Export |
| Recruitment | 📋 | Hiring, Ops, Google Sheets |
| Performance | 🔄 | Performance, Reviews, Development |
| Surveys | 🎤 | Town Hall, Engagement, Culture |

### Feature cards — Coming Soon (dashed border, 82% opacity)
| Card | Icon | Tags |
|---|---|---|
| Staff Support | 🙋 | People, Finance, IT, Learning |
| Benefits | 🏥 | US Based, India, WFA |
| Organizational Design | 🗺️ | Career, Growth, L1 L10 |
| Onboarding | 🚀 | Onboarding, Day 1, 90 Day Plan |
| Referrals | 🤝 | Hiring, Culture, Growth |
| Baseball Cards | 🃏 | Team, Directory, By Area |

### TODO / Next steps for People Hub
- [ ] Add real URLs to the 4 live card buttons (currently `href="#"`)
- [ ] Hall of Fame button → link to `daybreak_recognition_cards.html`
- [ ] Recruitment button → link to recruitment Vercel app
- [ ] Performance button → link to Breakcycle platform
- [ ] Surveys button → link to survey tool
- [ ] Activate coming soon cards as tools get built
- [ ] Consider adding a "What's New" or changelog section
- [ ] Consider adding a search bar across tools

---

## File 2: Hall of Fame (`daybreak_recognition_cards.html`)

### What it is
A baseball-themed peer recognition card generator. Breakers fill in a colleague's name, write a recognition message, and download a premium PDF card.

### Tech stack
- Pure HTML/CSS/JS
- **html2canvas** (CDN) for card capture
- **jsPDF** (CDN) for PDF generation
- Google Fonts (DM Sans)

### Award cards (6 individual + 1 team)
| Award | Theme color | Icon | Badge |
|---|---|---|---|
| Most Valuable Breaker (MVB) | Gold `#C9972A` | 🏆 | Individual Award |
| Cy Young Breaker | Green `#2D9B4E` | ⚡ | Execution Award |
| Gold Glove Breaker | Gold `#C9972A` | 🧤 | Defense Award |
| Roberto Clemente Breaker | Red `#C0392B` | 🌎 | Culture Award |
| Silver Slugger Breaker | Purple `#6B3FA0` | 🪄 | Impact Award |
| Golden Heart Breaker | Green `#2D9B4E` | 💚 | Kindness Award |
| World Series Champion Award | Navy `#1B2A4A` | ⚾ | Team Award |

### Card fields
- **Breaker's Name** (or Team Name for World Series)
- **Nominated by** (nominator's name — feeds into admin report)
- **Recognition** (free text)
- **Team Members** (World Series card only)

### PDF generation
- Uses `html2canvas` to **screenshot the actual card on screen** (not a separate render)
- Hides the footer buttons before capture, restores after
- PDF size = exact card size (custom format, not A4)
- File naming: `daybreak_[award_title]_[breaker_name].pdf`
- Scale 3x for high resolution

### Silent nomination logging
- Every PDF download logs to `localStorage` key `breaker_awards_log`
- Log entry: `{ id, award, breaker, nominator, desc, date, ts }`
- Readable from the admin report page

### Card design (dark theme)
- Dark gradient background per theme color
- Dot grid texture overlay
- Radial glow in corner
- Glassmorphism body panel (`rgba(255,255,255,0.06)`, `border: 1px solid rgba(255,255,255,0.11)`)
- Award icon in glowing circle
- Accent bar under award title

### TODO / Next steps for Hall of Fame
- [ ] Consider adding a date field to the card
- [ ] Add ability to preview before downloading
- [ ] Connect nomination log to a real backend (Google Sheets via Apps Script) so data is shared across browsers — currently localStorage only works per-browser
- [ ] Add a "Share via Slack" button that posts the card text to a channel
- [ ] Potentially add more award categories

---

## File 3: Admin Report (`daybreak_awards_admin.html`)

### What it is
Password-protected admin dashboard for Mile (People Ops) to view all nominations logged from the Hall of Fame.

### Password
`daybreak2025` — stored in plaintext in the JS, should be changed before sharing widely.

### Features
- Login screen with password
- Stats row: Total nominations, Unique breakers, Nominators, Active categories
- Table per award category showing: Breaker name, Nominated by, Recognition text, Date
- Auto "Top nominee" badge for most-nominated Breaker per category
- Delete individual entries
- Clear all entries
- Export to CSV

### Award categories tracked
1. Most Valuable Breaker (MVB)
2. Cy Young Breaker
3. Gold Glove Breaker
4. Roberto Clemente Breaker
5. Silver Slugger Breaker
6. Golden Heart Breaker
7. World Series Champion Award

### CRITICAL LIMITATION
The admin report reads from `localStorage` — which means it only shows nominations logged **in the same browser** on the same machine. If Breakers use the Hall of Fame from different devices, Mile cannot see their nominations from her own browser.

### TODO — Admin Report
- [ ] **Priority:** Replace localStorage with a real backend. Options:
  - **Google Sheets via Apps Script** (simplest — POST to a deployed Apps Script web app endpoint)
  - **Airtable API** (clean UI, easy to query)
  - **Supabase** (if Daybreak has a Supabase project)
- [ ] Hash the password instead of plaintext
- [ ] Add date range filter
- [ ] Add "Declare Winner" button per category

---

## Deployment Instructions (Vercel)

### Folder structure for Vercel
```
breaker-awards/
├── index.html                      ← rename daybreak_people_hub.html
├── hall-of-fame.html               ← rename daybreak_recognition_cards.html
├── admin.html                      ← rename daybreak_awards_admin.html
```

### Steps
1. Create folder `breaker-awards/` on local machine
2. Add the 3 renamed HTML files
3. Go to vercel.com → Add New Project → drag the folder
4. Deploy — Vercel detects it as a static site automatically
5. Update the Hall of Fame button URL in `index.html` to `./hall-of-fame.html`

### Live URLs after deploy (example)
```
https://breaker-awards.vercel.app              ← People Hub
https://breaker-awards.vercel.app/hall-of-fame.html  ← Hall of Fame
https://breaker-awards.vercel.app/admin.html   ← Admin (Mile only)
```

---

## Context about Daybreak

- ~50 person AI startup based in San Francisco
- Employees called "Breakers"
- All internal culture is baseball-themed: Breakers, Breakcycle, Breaker Awards, Breaksaries, Dawn (AI agent)
- CEO: Tim Krug (terse, emoji-heavy communication style, hates hyphens in text)
- CFO: Ben Scott
- CTO: Waleed Ayoub
- Head of People: Mile (Ana Milena Santamaria Novoa) — based in Medellín, Colombia
- Teams across US, Canada, India, Colombia, Costa Rica

---

## Key design decisions made

1. **No hyphens in visible text** — Tim's explicit preference
2. **Dark cards for Hall of Fame, white page for People Hub** — contrast helps them feel like separate tools
3. **PDF = screenshot of actual card** — ensures what you see is what you download
4. **localStorage for nominations** — temporary solution, needs real backend
5. **Standalone HTML files** — no framework, no build step, easy to deploy anywhere
6. **Logo embedded as base64** — so files work offline and without a server

---

## What Mile wants to build next (from conversation)

- Real backend for nomination tracking (Google Sheets preferred)
- Activate all "Coming Soon" cards as tools get built
- Baseball Cards directory (browse Breakers by team/area)
- Staff Support directory (People, Finance, IT, Learning contacts)
- Benefits pages (US, India, WFA)
- Organizational Design / Career Framework
- Onboarding guide

---

*Document generated: August 2026. All three HTML files are production-ready for Vercel deployment.*
