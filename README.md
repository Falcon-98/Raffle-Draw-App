# Guardian · Click 2026 — Live Lucky Draw

A colourful, animated raffle for the **Click 2026** customer event, built with **Next.js** and hosted free on **GitHub Pages**.

- **Live display** (`/`) — the screen the audience sees: floating name bubbles, a slot-machine reel, a winner reveal with confetti and fanfare, a winners board and an on-screen fairness strip.
- **Admin console** (`/admin/`) — PIN-protected control room: add names (Excel upload, copy-paste or typing), exclude people, set prizes, run draws, undo, export winners to Excel, back up and restore.

Everything runs in the browser. There is no server and no database, so nothing to pay for or maintain. The only optional extra is the small **live server** that lets the audience watch on their own phones (section 8).

### Features

**Running the draw**
- Certified-random winner (Web Crypto), saved *before* the reel spins; the reel always lands on that winner
- 3-2-1 countdown, slot-machine reel, winner reveal with confetti and fanfare (all synthesised, no audio files)
- **Prize quantities** — e.g. *3rd Prize × 5*; the screen shows "3 of 5 left", a used-up prize can't be drawn again, and the next prize is selected automatically
- **Not present → redraw** — mark a winner as absent; they stay in the record, can't win again, and the prize goes back up for a redraw
- **Winners showcase** — a full-screen "Our winners" slide grouped by prize for the finale
- Winners board in draw order (1, 2, 3 …), each new winner added at the bottom and scrolled into view; live entry counts, undo, one-prize-per-person
- Keyboard control on the display: <kbd>Space</kbd> draw · <kbd>Esc</kbd> back · <kbd>F</kbd> full screen · <kbd>W</kbd> winners · <kbd>M</kbd> sound · <kbd>?</kbd> help

**Participants**
- Excel (.xlsx) / CSV upload with header detection, copy-paste from Excel, or typing; duplicate detection and a preview before anything is added
- Exclude people one by one, by pasted list, or by search; demo data with 150 fictional people

**Trust & records**
- Pool fingerprint on screen, audit trail per draw (time, pool size, fingerprint), Excel export of winners with status
- PIN-protected admin, JSON backup & restore

**Event-proof**
- **Online live view** — the audience watches the draw in real time on their own phones (link + QR code); countdown, reel, winner and winners list follow the big screen
- Works **offline** after the first visit (service worker) and can be installed as an app
- **Company branding** from the admin: company name, uploaded logo (it replaces the cursor icon top-left), shown as *Name*, *Logo* or *Logo + name*; title, subtitle, sound, spin time and more change live
- Admin and display stay in sync in the same browser; opening the display twice can't cause a double draw

---

## 1. Live site (GitHub Pages)

| | URL |
|---|---|
| Live display | https://falcon-98.github.io/Raffle-Draw-App/ |
| Admin console | https://falcon-98.github.io/Raffle-Draw-App/admin/ |

Every push to `main` builds the site and publishes it with GitHub Actions (`.github/workflows/deploy.yml`). Progress is visible in the repository's **Actions** tab; a deploy takes about a minute.

The same workflow is also the CI check: every pull request into `main` is type-checked and built (but not deployed), so a broken change shows a red ❌ on the pull request before it can reach the live site. It is the only workflow needed — do not add GitHub's sample *Next.js* Pages workflow on top of it: that sample rewrites `next.config.mjs`, fails, and would race this deploy.

### One-time setup (repository owner)

1. **Settings → Pages → Build and deployment → Source: choose _GitHub Actions_.**
   This is required. If it is left on *Deploy from a branch*, GitHub also runs its own Jekyll build of the raw source code after every push and publishes that on top of the app — the URL then shows this README instead of the raffle.
2. Set the admin PIN: **Settings → Secrets and variables → Actions → New repository secret**, name `ADMIN_PIN`, value e.g. `G26-7731`. Without it the PIN is `click2026`. The PIN is baked in at build time, so after adding or changing the secret, re-run the deploy (**Actions → Deploy to GitHub Pages → Run workflow**).
3. Push to `main` (or use **Run workflow**). When the run is green, open the URLs above.

### Deploying from a fork or a renamed repository

The workflow works out the URL prefix from the repository name, so a fork or rename needs no code changes — the site appears at `https://<user>.github.io/<repo>/`. For a `<user>.github.io` repository, or a custom domain, it uses no prefix (for a custom domain add a repository *variable* `CUSTOM_DOMAIN` with any value, plus the usual `CNAME` file in `public/`).

### Troubleshooting

| Symptom | Fix |
|---|---|
| The URL shows this README / a plain document | Pages source is *Deploy from a branch*. Switch it to **GitHub Actions** (step 1) and re-run the workflow. |
| Workflow fails at *configure-pages* ("Get Pages site failed") | Pages is not enabled yet — do step 1. |
| Workflow fails at *deploy* with an environment protection error | **Settings → Environments → github-pages** must allow the `main` branch (the default). |
| Page loads but has no styling / blank | Hard-refresh (Ctrl+Shift+R). If it persists, check the run used the right repository name. |
| Admin PIN not accepted | The secret is applied at build time — re-run the workflow after setting `ADMIN_PIN`. |

## Try it with demo data

No list yet? Open the admin console, unlock it, and click **Demo data** in *Add participants*. It loads **150 fictional participants** (Sri Lankan names, tickets `DEMO-0001`… `DEMO-0150`, ten branches). You get the normal preview first, then choose **Add**. Then open the live display and draw.

- The same list can be downloaded as a file to test the upload flow: [`public/sample-participants.csv`](public/sample-participants.csv), also served at `https://falcon-98.github.io/Raffle-Draw-App/sample-participants.csv`.
- All names are made up. Before the real event, remove them with **Participants → Clear** (or **Backup & reset → Reset all**) and clear any demo winners.

## 2. Run it on your computer (optional)

Needs Node.js 22.9 or newer (CI uses Node 22).

```bash
npm install
npm run dev        # http://localhost:3000 and http://localhost:3000/admin/
npm run typecheck  # TypeScript check
npm run build      # static site in ./out
npm run preview    # serve ./out at http://localhost:3000
npm run live       # live server for the online live view (section 8)
npm start          # build + live server: the whole site and live view on http://localhost:8787
```

Settings go in a `.env` file: `cp .env.example .env` and fill in what you need (every line is explained in the file).

## 3. On the event day

1. Connect the laptop to the projector / LED wall in **extended** display mode.
2. Open the **admin** page in Chrome or Edge on the laptop screen and unlock it with the PIN.
3. Click **Open live display**. Drag that new window to the projector and press **F** for full screen. The admin header turns green: **Display connected**.
4. Click once anywhere on the display window so the browser allows sound.
5. Set up the prizes (**Prizes** card: name, how many, order). Pick the prize chip, then press **Draw a winner**. On the display itself, **Space** also draws, **Esc** returns to the welcome screen and **?** lists all shortcuts.
6. **Winner not here?** In **Winners**, press **Not present** next to their name. They are kept in the record as *Not present* and can't be drawn again, and the same prize is selected so you can draw again straight away.
7. When a prize runs out the next one is selected automatically (turn off *Next prize automatically* in *Display settings* to choose yourself). When everything has been drawn the display shows **All prizes drawn**.
8. For the finale press **Show all winners** (or **W** on the display) for a full-screen list of every winner, grouped by prize.

> **Both windows must be in the same browser on the same computer.** They talk to each other through the browser (BroadcastChannel + localStorage), which is why no server is needed. A phone opening the public site sees its own, empty copy — that is expected. To let people watch on their phones, use the **online live view** (section 8): they open a special link instead.

Data is saved automatically in the browser. Use **Backup & reset → Export backup** before the event, and keep the file. To move the draw to another laptop, restore that file there.

**No internet at the venue?** Open both the display and the admin page once while online (on the laptop you will use). The site is then stored in the browser and keeps working offline, including fonts. Chrome and Edge can also install it as an app (install icon in the address bar).

## 4. Participant list

Click **Excel template** in the admin to download the ready-made file.

| Name *(required)* | Ticket / ID | Branch / Department |
|---|---|---|
| Nimal Perera | C26-0001 | Colombo |

- Accepts **.xlsx** and **.csv**. (Old **.xls**: open it in Excel and *Save As → Excel Workbook*.)
- The first sheet is read. A header row is detected automatically (a column called *Name*, *Full name*, *Customer name*, … is the name; *Ticket*, *ID*, *No.*, *Code* is the ticket; *Branch*, *Department*, *City*, … is the branch — so a "Customer ID" column is never mistaken for the name). Without a header, column A is the name, B the ticket, C the branch.
- **Copy & paste** works with plain names (one per line) or rows copied straight out of Excel.
- Duplicates are skipped — same Ticket/ID, or same name when there is no ID. Before anything is added you see a preview with counts, and you choose **Add** or **Replace current list**.

**Excluding people:** use the switch next to each name, **Exclude by list** to paste many names/IDs at once, or **Exclude all shown** after a search (e.g. search a branch name). Excluded people stay on the list and can be switched back on.

## 5. Why the audience can trust it

- **Certified randomness** — winners are picked with the browser's cryptographic generator (`crypto.getRandomValues`) with rejection sampling, so every eligible person has exactly the same chance. `Math.random` is only used for the decorative reel filler.
- **Result locked first** — the winner is chosen and saved *before* the reel starts. The animation only reveals it; refreshing the page cannot re-roll a result.
- **The reel always stops on the winner** — the name that lands in the window is always the saved, announced winner, on any screen size (including 1024×768 projectors) and even if the window is resized or switched to full screen mid-spin.
- **Pool fingerprint** — the footer shows a short SHA-256 fingerprint of the eligible list. It only changes if someone is added or removed, so you can show it before the first draw and anyone can see it stays consistent. Each winner record stores the fingerprint and pool size at that moment.
- **Audit export** — **Winners → Excel** gives draw number, prize, name, ticket, time, pool size and fingerprint.
- **One prize per person** (on by default) automatically removes winners from later draws.
- **No double draws** — if the display is accidentally open in two windows, a single *Draw a winner* click still produces exactly one winner; both windows show the same name.
- **Stable draw numbers** — undoing a win never causes a later draw to reuse an earlier draw number.
- **Absent winners stay on record** — *Not present* never deletes a draw; the Excel export shows it as "Not present (redrawn)" next to the redraw.

## 6. Customising

| What | Where |
|---|---|
| Company name and logo | Admin → *Display settings → Company*: type the name, upload a logo (PNG, JPG, SVG; resized automatically) and choose **Name**, **Logo** or **Logo + name**. The logo takes the place of the cursor icon at the top-left of the display; the name appears above the event title. Saved in the browser and in backups. For a permanent default, set `company` in `lib/config.ts`, or put a file in `public/brand/` and set `logo: '/brand/logo.png'`. |
| Default company name, event name, tagline | `lib/config.ts` |
| Default prize list | `lib/config.ts` → `DEFAULT_PRIZES` (names, quantities and order are editable live in the admin) |
| Winner name colours | Admin → *Display settings → Winner name colours*: presets (Aurora, Gold, Sunset, Ocean, Emerald, White) or three custom colours, with a live preview. More presets: `NAME_COLOR_PRESETS` in `lib/config.ts` |
| Colours, fonts, animation | `app/globals.css` (tokens at the top) |
| Title, subtitle, bubbles, countdown, auto next prize, sound, spin time, winners board | Admin → *Display settings* (live) |

## 7. Good to know

- The admin PIN is a *soft* gate that keeps the audience out of the admin screen. A static site cannot hide data from someone determined, so do not include phone numbers, NICs or other private data in the list — names and ticket numbers are enough.
- Large lists are fine: thousands of names import in a second; the bubbles show them in rotating groups; the reel samples from the pool.
- Fonts load from Google Fonts and are cached for offline use after the first visit. Without that visit and without internet, the page still works with system fonts. You can also run it locally with `npm run build && npm run preview`.
- After a new deploy, the next online visit loads the new version automatically (pages are always fetched fresh when online).

## 8. Online live view (watch on your phone)

Let the audience follow the draw live on their own phones — at the venue or anywhere in the world. They see the welcome screen, the 3-2-1 countdown, the reel landing on the winner, the winner card with confetti, the winners list and the "Our winners" finale, all in real time. They can only watch; the draw itself still happens on the event laptop.

### How it works

```
 Event laptop                          Live server                          Audience phones
 ┌────────────────┐   publishes each   ┌──────────────────────┐   pushes   ┌───────────────┐
 │ Admin + Display│ ── screen change ─▶│ Cloudflare or Node   │ ─ live ──▶ │ /live/?r=CODE │
 └────────────────┘   (secret key)     │ data/live.json        │ (SSE)      └───────────────┘
                                       └──────────────────────┘
```

- There are two interchangeable live servers with the same API — pick one:
  - **Cloudflare (recommended for events):** `cloudflare/` — a Cloudflare Worker with one Durable Object per room, which keeps the room's JSON in its own storage. Always online, free plan, no laptop or tunnel needed. Deployed by a GitHub Action.
  - **Node.js + JSON file:** `server/live-server.mjs` — a tiny server with **no database and no extra packages**; rooms are stored in a **JSON file** (`data/live.json`). Runs on the event laptop (plus a tunnel) or any Node host.
- Each live view is a *room* with a random code (e.g. `RZDGUSHA`) and a secret key. The key stays in the event laptop's browser; the server keeps only a hash of it, so nobody else can publish to your room.
- Viewers get updates instantly over a live stream (Server-Sent Events). On networks that block streams they automatically switch to checking every 3 seconds.

### Option A — Cloudflare (recommended)

One-time setup, about 5 minutes:

1. **Create an API token:** Cloudflare dashboard → *My Profile → API Tokens → Create Token* → template **Edit Cloudflare Workers** → *Continue → Create Token*. Copy it.
2. **Find your Account ID:** Cloudflare dashboard → *Workers & Pages* → **Account ID** on the right.
3. **Add them to GitHub:** repository *Settings → Secrets and variables → Actions → Secrets → New repository secret*:
   - `CLOUDFLARE_API_TOKEN` = the token
   - `CLOUDFLARE_ACCOUNT_ID` = the account ID
   - optional `LIVE_CREATE_TOKEN` = a password needed to start a live view (recommended)
4. **Deploy:** *Actions → Deploy live server to Cloudflare → Run workflow*. When it finishes, the run summary shows the address, e.g. `https://raffle-live.<your-subdomain>.workers.dev`. (It also redeploys by itself whenever `cloudflare/` changes on `main`.)
5. *(Optional)* Add that address as the repository **variable** `LIVE_SERVER_URL` and re-run *Deploy to GitHub Pages*, so the admin is pre-filled.

On the event day: Admin → **Online live view** → enter the address (if not pre-filled) → **Test connection** → **Go live**, then continue with step 4 below.

Free plan limits are far above what a raffle needs (100,000 requests a day). Rooms untouched for 7 days are deleted automatically. To try it locally: `cd cloudflare && npm install && npm run dev` (serves on `http://localhost:8787`).

### Option B — Node.js server with a JSON file

1. **Start the live server** on the event laptop (or any computer/host that stays on):
   ```bash
   cp .env.example .env     # optional: set LIVE_CREATE_TOKEN (a password) and other options
   npm install
   npm start                # builds the site and starts the server on http://localhost:8787
   ```
   `npm start` serves the whole site too, so `http://localhost:8787/admin/` works without GitHub Pages. (`npm run live` starts only the server.)
2. **Make it reachable from the internet.** Phones can't open `localhost`. The easiest free option is a Cloudflare quick tunnel ([install cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)):
   ```bash
   cloudflared tunnel --url http://localhost:8787
   ```
   It prints an address like `https://something-random.trycloudflare.com`. Keep that window open during the event. (Any Node.js host works as well — run `npm run live` there; note that free hosts often wipe files on restart, which only matters if you restart mid-event.)
3. **In the admin → Online live view**, enter the server address (the tunnel address, or `http://localhost:8787` when you only test on the laptop), press **Test connection**, then **Go live**.
4. **Share it:** the card shows the **link and QR code**. Turn on **QR code on the big screen** so the audience can scan it from the projector; it hides itself while the reel spins. The card also shows how many people are watching.
5. **Keep the live display open** — it is what sends the screen to the viewers.
6. Afterwards press **Stop live view**: viewers see "The live draw has ended" and the link stops working.

### Settings (`.env`, Node.js server)

On Cloudflare the same options are `ALLOWED_ORIGINS` in `cloudflare/wrangler.toml` and the `LIVE_CREATE_TOKEN` GitHub secret.


| Setting | What it does |
|---|---|
| `NEXT_PUBLIC_LIVE_SERVER_URL` | Default server address pre-filled in the admin. For GitHub Pages set the repository **variable** `LIVE_SERVER_URL` instead. |
| `PORT` | Live server port (default `8787`). |
| `LIVE_DATA_FILE` | JSON file for live rooms (default `data/live.json`, ignored by git). |
| `LIVE_CREATE_TOKEN` | Password needed to start a live view (enter it in the admin). Recommended when the server is on the internet. |
| `ALLOWED_ORIGINS` | Only allow these sites to use the server, e.g. `https://falcon-98.github.io`. |
| `STATIC_DIR` | Built site the server also serves (default `out`). |

**Later — a database instead of the JSON file:** the website only talks to the server's small API (`POST /api/rooms`, `PUT /api/rooms/:code`, `GET /api/rooms/:code`, `GET /api/rooms/:code/events`). Moving to a hosted database such as Supabase means changing only `server/live-server.mjs`; `.env.example` already has a place for the connection details.

### Privacy

Everything sent to viewers is public to anyone with the link: the event branding, current prize, counts, up to 60 participant names for the floating bubbles, and the winners (name, ticket and branch, as on the big screen). The full participant list, exclusions and settings never leave the laptop.

## Project structure

```
app/
  page.tsx            Live display
  admin/page.tsx      Admin console
  live/page.tsx       Online live view for the audience's phones
  layout.tsx, globals.css
components/
  Bubbles.tsx         Floating name bubbles
  Reel.tsx            Slot-machine reel
  Brand.tsx, Icons.tsx
  ServiceWorker.tsx   Registers the offline service worker
  Stage.tsx           Countdown, winner name, confetti (shared by display and live view)
  QrCode.tsx          QR codes for the live view link
  admin/              Import panel, participant list, PIN gate, switches
lib/
  store.ts            State, localStorage + cross-window sync
  fair.ts             Secure random + pool fingerprint
  excel.ts            Excel/CSV import, template + winners export
  sound.ts            Synthesised sound effects (no audio files)
  config.ts           Branding and defaults
  live.ts             Online live view: screen snapshot, publisher, server API
server/
  live-server.mjs     Live server (Node, no dependencies; stores rooms in data/live.json)
cloudflare/
  src/worker.ts       Live server on Cloudflare (Worker + one Durable Object per room)
  wrangler.toml       Cloudflare settings
.github/workflows/deploy-live-server.yml   Deploys cloudflare/ (needs the Cloudflare secrets)
public/
  sample-participants.csv   150 fictional participants (the "Demo data" button)
  sw.js                     Offline cache (service worker)
  manifest.webmanifest      Install-as-app details
.env.example        All settings, explained (copy to .env)
.github/workflows/deploy.yml   Build & deploy to GitHub Pages
```
