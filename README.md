# Guardian · Click 2026 — Live Lucky Draw

A colourful, animated raffle for the **Click 2026** customer event, built with **Next.js** and hosted free on **GitHub Pages**.

- **Live display** (`/`) — the screen the audience sees: floating name bubbles, a slot-machine reel, a winner reveal with confetti and fanfare, a winners board and an on-screen fairness strip.
- **Admin console** (`/admin/`) — PIN-protected control room: add names (Excel upload, copy-paste or typing), exclude people, set prizes, run draws, undo, export winners to Excel, back up and restore.

Everything runs in the browser. There is no server and no database, so nothing to pay for or maintain.

---

## 1. Put it on GitHub Pages

1. Create a new repository on GitHub (for example `click-2026-raffle`) and push this folder to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Click 2026 lucky draw"
   git branch -M main
   git remote add origin https://github.com/<your-user-or-org>/click-2026-raffle.git
   git push -u origin main
   ```
2. In the repository go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Set the admin PIN: **Settings → Secrets and variables → Actions → New repository secret**, name `ADMIN_PIN`, value e.g. `G26-7731`. (Without it the PIN is `click2026`.)
4. Push any change (or run the workflow from the **Actions** tab). After a minute or two the site is live at
   - Display: `https://<user>.github.io/click-2026-raffle/`
   - Admin: `https://<user>.github.io/click-2026-raffle/admin/`

The workflow (`.github/workflows/deploy.yml`) works out the URL prefix automatically. For a `<user>.github.io` repo or a custom domain it uses no prefix (for a custom domain add a repository *variable* `CUSTOM_DOMAIN` with any value, plus the usual `CNAME` file in `public/`).

## 2. Run it on your computer (optional)

```bash
npm install
npm run dev        # http://localhost:3000 and http://localhost:3000/admin/
npm run build      # static site in ./out
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
- The first sheet is read. A header row is detected automatically; without one, column A is the name, B the ticket, C the branch.
- **Copy & paste** works with plain names (one per line) or rows copied straight out of Excel.
- Duplicates are skipped — same Ticket/ID, or same name when there is no ID. Before anything is added you see a preview with counts, and you choose **Add** or **Replace current list**.

**Excluding people:** use the switch next to each name, **Exclude by list** to paste many names/IDs at once, or **Exclude all shown** after a search (e.g. search a branch name). Excluded people stay on the list and can be switched back on.

## 5. Why the audience can trust it

- **Certified randomness** — winners are picked with the browser's cryptographic generator (`crypto.getRandomValues`) with rejection sampling, so every eligible person has exactly the same chance. `Math.random` is only used for the decorative reel filler.
- **Result locked first** — the winner is chosen and saved *before* the reel starts. The animation only reveals it; refreshing the page cannot re-roll a result.
- **Pool fingerprint** — the footer shows a short SHA-256 fingerprint of the eligible list. It only changes if someone is added or removed, so you can show it before the first draw and anyone can see it stays consistent. Each winner record stores the fingerprint and pool size at that moment.
- **Audit export** — **Winners → Excel** gives draw number, prize, name, ticket, time, pool size and fingerprint.
- **One prize per person** (on by default) automatically removes winners from later draws.

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
.github/workflows/deploy.yml   Build & deploy to GitHub Pages
```
