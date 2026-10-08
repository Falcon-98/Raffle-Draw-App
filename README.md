# Guardian · Click 2026 — Live Lucky Draw

A colourful, animated raffle for the **Click 2026** customer event, built with **Next.js** and hosted free on **GitHub Pages**.

- **Live display** (`/`) — the screen the audience sees: floating name bubbles, a slot-machine reel, a winner reveal with confetti and fanfare, a winners board and an on-screen fairness strip.
- **Admin console** (`/admin/`) — PIN-protected control room: add names (Excel upload, copy-paste or typing), exclude people, set prizes, run draws, undo, export winners to Excel, back up and restore.

Everything runs in the browser. There is no server and no database, so nothing to pay for or maintain.

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

Needs Node.js 20.9 or newer (CI uses Node 22).

```bash
npm install
npm run dev        # http://localhost:3000 and http://localhost:3000/admin/
npm run typecheck  # TypeScript check
npm run build      # static site in ./out
npm run preview    # serve ./out at http://localhost:3000
```

## 3. On the event day

1. Connect the laptop to the projector / LED wall in **extended** display mode.
2. Open the **admin** page in Chrome or Edge on the laptop screen and unlock it with the PIN.
3. Click **Open live display**. Drag that new window to the projector and press **F** for full screen. The admin header turns green: **Display connected**.
4. Click once anywhere on the display window so the browser allows sound.
5. Pick the prize chip, then press **Draw a winner**. (On the display itself, **Space** also draws and **Esc** returns to the welcome screen.)

> **Both windows must be in the same browser on the same computer.** They talk to each other through the browser (BroadcastChannel + localStorage), which is why no server is needed. A phone opening the public link sees its own, empty copy — that is expected.

Data is saved automatically in the browser. Use **Backup & reset → Export backup** before the event, and keep the file. To move the draw to another laptop, restore that file there.

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

## 6. Customising

| What | Where |
|---|---|
| Company name, event name, tagline, logo | `lib/config.ts` (put a logo in `public/brand/` and set `logo: '/brand/logo.png'`) |
| Default prize list | `lib/config.ts` → `DEFAULT_PRIZES` (also editable live in the admin) |
| Colours, fonts, animation | `app/globals.css` (tokens at the top) |
| Title, subtitle, bubbles, sound, spin time, winners board | Admin → *Display settings* (live) |

## 7. Good to know

- The admin PIN is a *soft* gate that keeps the audience out of the admin screen. A static site cannot hide data from someone determined, so do not include phone numbers, NICs or other private data in the list — names and ticket numbers are enough.
- Large lists are fine: thousands of names import in a second; the bubbles show them in rotating groups; the reel samples from the pool.
- Fonts load from Google Fonts. If the venue has no internet the page still works with system fonts — open the site once beforehand while online so it is cached, or run it locally with `npm run build && npm run preview`.

## Project structure

```
app/
  page.tsx            Live display
  admin/page.tsx      Admin console
  layout.tsx, globals.css
components/
  Bubbles.tsx         Floating name bubbles
  Reel.tsx            Slot-machine reel
  Brand.tsx, Icons.tsx
  admin/              Import panel, participant list, PIN gate, switches
lib/
  store.ts            State, localStorage + cross-window sync
  fair.ts             Secure random + pool fingerprint
  excel.ts            Excel/CSV import, template + winners export
  sound.ts            Synthesised sound effects (no audio files)
  config.ts           Branding and defaults
public/
  sample-participants.csv   150 fictional participants (the "Demo data" button)
.github/workflows/deploy.yml   Build & deploy to GitHub Pages
```
