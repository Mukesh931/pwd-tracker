# Publishing on Your Own Domain (e.g. `pwd.nashikworks.in`)

A domain is just an address. To make `https://yourdomain.com` open this app you need:

1. **A place that runs the app 24×7** (a server)
2. **The domain itself** (bought from a registrar, ~₹600–1,000/year)
3. **DNS records** pointing the domain at that server (2-minute form fill at the registrar)
4. **HTTPS** (free, automatic with the tools below)

Pick ONE route:

---

## Route 1 – Small VPS (recommended: permanent, private, cheapest full control)

**Cost:** VPS ₹350–600/month (Hostinger KVM1, DigitalOcean Basic, Contabo, Oracle Cloud free tier)
+ domain ₹600–1,000/year.

1. **Buy a domain** – GoDaddy / Namecheap / Hostinger / BigRock / Zen (any registrar).
   Prefer `.in` or `.com`.
2. **Buy a VPS** (Ubuntu 22.04/24.04). Note its **IP address** (e.g. `168.169.1.2`).
3. **DNS (at the registrar's control panel):** add records
   | Type | Name | Value |
   |---|---|---|
   | A | `@` | *your VPS IP* |
   | A | `www` | *your VPS IP* |
   (propagation: usually < 15 min, sometimes a few hours)
4. **On the VPS:**
   ```
   ssh root@YOUR-VPS-IP
   git clone https://<YOUR-TOKEN>@github.com/Mukesh931/pwd-tracker.git /opt/pwd-tracker
        # repo is private: use a fresh fine-grained PAT, or upload the zip & unzip here
   cd /opt/pwd-tracker/deploy
   sudo bash setup-vps.sh yourdomain.com you@example.com
   ```
   The script installs Node 20, pm2 (auto-start on reboot), nginx, and free Let's-Encrypt
   HTTPS with http→https redirect. Done: **https://yourdomain.com**
5. Optional simpler HTTPS: use **Caddy** instead of nginx+certbot (see `deploy/Caddyfile`).

**Care:** your data lives in `/opt/pwd-tracker/data/tracker.db`. Take weekly backups
(app Settings ▸ Data ▸ backup, or copy the file).

---

## Route 2 – Your office PC + Cloudflare Tunnel (₹0 extra: no VPS, no open ports)

Good if one office computer can stay switched on during work hours.

1. Buy the domain **through Cloudflare** (or transfer an existing one) – free plan is enough.
2. On the office PC (Windows/Linux) run the app as usual (`npm start`).
3. Install **cloudflared** on that PC and create a tunnel (Cloudflare Zero Trust dashboard ▸
   Networks ▸ Tunnels ▸ Create  give public hostname `pwd.yourdomain.com` →
   `http://localhost:3000`). Cloudflare gives HTTPS automatically; no router/firewall changes.
4. Site is live while the PC is on; offline outside work hours.

---

## Route 3 – Cloud PaaS with custom domain (no server admin at all)

- **Render / Railway / Fly.io**: connect the GitHub repo, deploy, then in the service
  dashboard add *Custom Domain* → it shows you a CNAME record → add it at your registrar.
  HTTPS is automatic.
- **Catch:** these platforms erase local disk on redeploy. SQLite must sit on a paid
  persistent volume, or you restore a JSON backup after each deploy. For a single user with
  important data, Route 1 or 2 is safer.

---

## DNS cheat-sheet

| Goal | Record |
|---|---|
| `yourdomain.com` → VPS | A `@` → VPS IP |
| `www.yourdomain.com` → VPS | A `www` → VPS IP |
| subdomain for tunnel/PaaS | CNAME `pwd` → target given by Cloudflare/Render |
| check propagation | `dig +short yourdomain.com` or dnschecker.org |

## After go-live checklist

- [ ] `https://yourdomain.com` opens the dashboard with the lock icon
- [ ] Settings ▸ Letterhead shows your office name on PDFs
- [ ] Settings ▸ Data ▸ backup downloaded once (test restore on your PC)
- [ ] If others must not see it: keep it private with nginx basic-auth, or simply don't share
      the URL (the app itself has no login yet — ask for one if you need multi-user access)
