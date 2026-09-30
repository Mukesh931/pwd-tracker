# Route 2 – Publish on your domain from your OFFICE PC via Cloudflare Tunnel (₹0/month)

The app keeps running on your office computer exactly as today (`npm start`).
Cloudflare's free tunnel gives it a public `https://…` address with a locked door,
without touching your router or firewall. Site is live whenever the PC is on.

```
 visitor browser ──HTTPS──▶ Cloudflare edge ──tunnel──▶ cloudflared on your PC ──▶ localhost:3000 (app)
```

## Step 0 – Prerequisites
- Office PC (Windows or Linux) with the app running: `npm start` → check `http://localhost:3000`.
- Power settings: *never sleep* while plugged in (Windows: Settings ▸ Power ▸ Sleep = Never).
- A domain on Cloudflare (Step 1). If you own one elsewhere, you can add it to Cloudflare
  for free by changing two nameservers at your current registrar.

## Step 1 – Domain on Cloudflare (free plan)
1. https://dash.cloudflare.com → sign up / log in.
2. **No domain yet?** Left menu ▸ *Domain Registration* ▸ *Register Domains* → search your name
   (`.in` ≈ ₹700–900/yr, `.com` ≈ ₹850–1,100/yr at cost) → buy. It is on Cloudflare instantly.
   **Own a domain?** *Add a site* → enter it → Cloudflare shows 2 nameservers → paste those at
   your current registrar (GoDaddy/Hostinger/etc.) → wait for “Active” (minutes to a few hours).

## Step 2 – Create the tunnel (browser, no config files)
1. https://one.dash.cloudflare.com → create a **Free** Zero Trust account (same login).
2. Left menu ▸ **Networks ▸ Tunnels ▸ Create a tunnel** → type **Cloudflared** → name it `office-pc`.
3. The page now shows an install command containing a long token, per OS:
   - **Windows (PowerShell as Administrator):**
     ```
     winget install --id Cloudflare.cloudflared
     cloudflared.exe service install <PASTE-TOKEN>
     ```
     (or download `cloudflared-windows-amd64.msi` from github.com/cloudflare/cloudflared/releases)
   - **Linux:**
     ```
     wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
     sudo dpkg -i cloudflared-linux-amd64.deb
     sudo cloudflared service install <PASTE-TOKEN>
     ```
   The tunnel now runs as a system service (auto-starts with the PC). Dashboard shows it
   **HEALTHY** within a minute.

## Step 3 – Point a hostname at the app
In the same tunnel page ▸ **Public Hostnames ▸ Add a public hostname**:
- Subdomain: `pwd` (or leave blank to use the bare domain) · Domain: pick yours
- Service: type **HTTP**, URL **localhost:3000**
- Save. Within seconds **https://pwd.yourdomain.com** opens your tracker from anywhere.

## Step 4 – Put a lock on the door (important – the app has no login)
Cloudflare Access (free ≤ 50 users) adds an email-one-time-PIN screen in front of the site:
1. one.dash.cloudflare.com ▸ **Access ▸ Applications ▸ Add an application ▸ Self-hosted**.
2. Domain: `pwd.yourdomain.com` (or `*` subdomain) · Session 24 h.
3. **Policy**: name `only-me`, action **Allow**, include ▸ **Emails** ▸ your email address.
Now any visitor first sees Cloudflare’s login page; only your email gets a code that opens the app.
Add colleagues’ emails to the same policy later if needed.

## Step 5 – Daily-use notes
- Works hours = site up. PC off/sleep = site shows a Cloudflare error page (normal).
- Start the app automatically at boot:
  - Windows: Task Scheduler ▸ create task “at log on” ▸ `cmd /c cd /d D:\pwd-tracker && npm start`
    (or use `nssm install pwdtracker "C:\Program Files\nodejs\node.exe" "D:\pwd-tracker\server.js"`).
  - Linux: `pm2 start server.js --name pwd && pm2 save && pm2 startup`.
- Updates: `git pull` in the app folder, restart app; tunnel keeps working unchanged.
- Backups: Settings ▸ Data ▸ backup (JSON) weekly, or copy `data/tracker.db`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Tunnel not HEALTHY | re-run the `service install <token>` command; check PC internet |
| 502 Bad Gateway | app not running on the PC (`npm start`), or hostname URL typo (must be `localhost:3000`) |
| “Access denied” for you | your email not in the Access policy (Step 4) |
| Domain not Active | nameservers not yet changed/propagated at old registrar (up to 24 h) |
