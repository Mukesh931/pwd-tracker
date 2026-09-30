# Downloading, Running Offline & Publishing Online

## 0. What you are downloading

`pwd-tracker.zip` (see the file viewer / download button) contains the **complete project**:
server, database engine, PDF/Excel generators, web UI, Devanagari fonts, sample database,
README, USER-GUIDE and this file. It does **not** contain `node_modules` (restored by one command).

Requirements on any machine: **Node.js 20 or newer** (https://nodejs.org – LTS installer,
Windows/macOS/Linux) and internet once, for `npm install`.

---

## 1. Offline / single-user (recommended for personal use)

```
1. Unzip pwd-tracker.zip  (e.g. D:\pwd-tracker  or  ~/pwd-tracker)
2. Open a terminal / command prompt in that folder
3. npm install          ← one time only (needs internet)
4. npm start            ← starts the server
5. Open browser →  http://localhost:3000
```

- Works fully offline after step 3. Data stays in `data/tracker.db` on that computer.
- To auto-start on Windows: save `start.cmd` containing `cd /d D:\pwd-tracker && npm start`
  and put a shortcut in the Startup folder. On Linux/macOS: a `.desktop`/shell alias works the same.
- Only you can see it (localhost). That is perfect for single-user offline use.
- Access from another device on your home/office Wi-Fi: use `http://<your-pc-ip>:3000`
  (allow Node through the firewall once).

## 2. Publishing online (so it opens from anywhere / any device)

The app is an ordinary Node.js web server (reads `PORT` env, binds 0.0.0.0, SQLite file storage),
so **any** host that runs Node works. Three practical routes, easiest first:

### 2a. Small VPS (best for permanent, private, single-user use) — e.g. DigitalOcean /
Hostinger / Vultr / Oracle-free-tier, ₹300–500/month or free tier
```
sudo apt update && sudo apt install -y nodejs npm nginx
git clone <your-repo> pwd-tracker  (or scp the unzipped folder)
cd pwd-tracker && npm install --omit=dev
npm start                       # test, then make it a service:
sudo npm i -g pm2 && pm2 start server.js --name pwd && pm2 save && pm2 startup
```
Point the VPS IP (or a domain) at port 3000 via nginx, add basic-auth in nginx if you want a
login wall. SQLite file persists on the VPS disk → your data is safe and backed up by you.

### 2b. Platform-as-a-service (Render / Railway / Fly.io) — no server administration
- Push this folder to a GitHub repo (node_modules excluded automatically by `.gitignore`-style upload).
- New Web Service → build `npm install`, start `npm start`, set env `PORT` (they inject it).
- **Important:** these platforms wipe the disk on redeploy. Attach a persistent volume and set the
  app’s data dir to it, or simply take weekly JSON backups (Settings ▸ Data) and restore after
  deploys. For a single user with irreplaceable data, 2a or offline is safer.

### 2c. Docker (any host incl. office server / NAS)
A `Dockerfile` is included:
```
docker build -t pwd-tracker .
docker run -d --name pwd -p 3000:3000 -v pwd-data:/app/data pwd-tracker
```
The volume keeps `tracker.db` across container upgrades.

## 3. About the preview link in this chat

The “live preview” URL shown while we work together is a **temporary sandbox** — it disappears when
the session ends and its disk is not guaranteed. Treat it as a demo window only; your permanent copy
is the zip + one of the routes above.

## 4. Moving your data between machines

Copy `data/tracker.db` (whole database) **or** use Settings ▸ Data ▸ Download backup (JSON) and
restore on the other machine. Both keep works, bills, milestones, documents, remarks, history,
settings and the audit log.
