# Tally CRM

A CRM prototype with sales pipeline, contacts, and a Meta/Google ads reporting dashboard. It can use a shared server copy of the CRM data for cross-device sync, while `localStorage` stays as a fallback and migration source.

Built with Next.js 14 (App Router), React 18, recharts, and lucide-react.

---

## Run locally

You need Node.js 18.17 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000 in Chrome.

---

## Deploy to Vercel

Three options, fastest first.

### Option A — Vercel CLI (one terminal command)

```bash
npm install -g vercel
vercel
```

The CLI will:
1. Open a browser to log you into Vercel (free account works).
2. Ask a few yes/no questions (default answers are fine).
3. Build and deploy. You'll get a `https://tally-crm-xxx.vercel.app` URL.

For a production URL (no `-xxx` preview suffix):

```bash
vercel --prod
```

### Option B — GitHub + Vercel dashboard (most common)

1. Create a new GitHub repo (any name, can be private).
2. In this folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. Go to https://vercel.com/new, click **Import** next to your repo.
4. Leave all settings as default and click **Deploy**.
5. After ~1 minute you'll get a live URL.

### Option C — Drag and drop (no Git needed)

1. Run `npm install` once locally so `node_modules` exists.
2. Run `npm run build` — produces a `.next` folder.
3. Zip the whole folder (including `node_modules` and `.next`).
4. Go to https://vercel.com/new and drag the zip in.

Option B is what most people use; Option A is fastest if you're comfortable with the terminal.

---

## Open in Chrome

After Vercel finishes deploying, it gives you a URL like `https://tally-crm-abc123.vercel.app`. Paste that into Chrome and you're live. The site works on mobile Chrome too — the sidebar collapses behind a hamburger menu under 900px.

---

## Shared Sync Setup

To make contacts, deals, accounts, campaigns, and sync timestamps match across devices, configure these environment variables in Vercel:

- `BLOB_READ_WRITE_TOKEN`
- `CRM_SHARED_PASSWORD`
- `CRM_SESSION_SECRET`

What they do:

- `BLOB_READ_WRITE_TOKEN`: lets the app store one shared CRM state file in Vercel Blob
- `CRM_SHARED_PASSWORD`: the password your team enters to unlock the shared CRM
- `CRM_SESSION_SECRET`: signs the secure session cookie used after login

How to enable it:

1. Add a **Blob** store to the Vercel project.
2. Confirm Vercel adds `BLOB_READ_WRITE_TOKEN`.
3. Add `CRM_SHARED_PASSWORD` and `CRM_SESSION_SECRET` to the Production environment.
4. Redeploy production.
5. Open the site and sign in with the shared sync password.

If the shared store is still empty but this browser already has local CRM data, the app will upload that local data into the shared server copy on first sign-in.

---

## Notes

- **Shared sync uses Vercel Blob** when the required env vars are configured. Without that setup, the app falls back to `localStorage`, so each browser keeps its own separate copy.
- **Sync now** updates a local timestamp; it doesn't call the Meta/Google ads APIs (those need OAuth + server credentials).
- **Download PDF** opens the browser's print dialog. The sidebar and topbar are hidden in print via the `@media print` styles.
