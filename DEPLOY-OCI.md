# Deploying to Oracle Cloud (OCI) — Node.js + nginx + free SSL

This guide takes you from a freshly created OCI VM (Oracle Linux 9) to your
website live on the internet at your own domain, over HTTPS, with a free
auto-renewing Let's Encrypt certificate (Certbot).

**Architecture**

```
Internet ──► OCI ports 80/443 ──► nginx (TLS) ──► Node/Express on 127.0.0.1:3000
                                     │
                                  Certbot (Let's Encrypt, auto-renew)
```

Replace `incolosystems.com` below with your real domain everywhere it appears.
The default login user on Oracle Linux OCI images is **`opc`**.

---

## 0. What you need before starting

- An OCI VM (Compute instance), Oracle Linux 9, with a **public IP** — note it down.
- SSH access to it (the private key you downloaded when creating the instance).
- Your domain's DNS control panel (at your registrar).
- SMTP details for a mailbox on your domain (host, port, username, password) —
  used to send the contact-form email.

---

## 1. Open ports 80 & 443 in OCI (the #1 gotcha)

OCI blocks inbound traffic by default at the virtual-network level. You must add
ingress rules **or the site is unreachable even when everything else is perfect.**

1. OCI Console → **Networking → Virtual Cloud Networks** → your VCN → **Subnets**
   → your subnet → **Security Lists** → the default list.
2. **Add Ingress Rules** (two of them):
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **80**
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **443**
3. Save. (Port 22 for SSH is already allowed by default.)

> If your instance uses a **Network Security Group** instead, add the same two
> rules there.

---

## 2. SSH into the server

```bash
ssh -i /path/to/your-private-key opc@YOUR_PUBLIC_IP
```

Then update the OS:

```bash
sudo dnf update -y
```

---

## 3. Open the OS firewall (firewalld)

Oracle Linux runs firewalld locally in addition to OCI's rules — open it too:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

## 4. Install Node.js, git, and nginx

```bash
# Node.js 20 LTS (NodeSource)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git nginx

# Verify
node -v      # should print v20.x
nginx -v
```

Enable and start nginx:

```bash
sudo systemctl enable --now nginx
```

Visit `http://YOUR_PUBLIC_IP` in a browser — you should see the nginx welcome
page. If you do, ports 80 and the firewall are correct.

---

## 5. Get the website code onto the server

**Option A — clone from your GitHub repo** (if you pushed it there):

```bash
cd /home/opc
git clone https://github.com/YOUR-USERNAME/incolo-website.git incolo-site
cd incolo-site
```

**Option B — copy from your Mac** (run this on your Mac, not the server):

```bash
scp -i /path/to/your-private-key -r \
  /Users/gauravdua/Documents/ClaudeDir/Projects/Incolowebsite/site \
  opc@YOUR_PUBLIC_IP:/home/opc/incolo-site
```

Then on the server:

```bash
cd /home/opc/incolo-site
npm install --omit=dev        # installs express, nodemailer, dotenv only
```

---

## 6. Configure secrets (`.env`)

```bash
cd /home/opc/incolo-site
cp .env.example .env
nano .env        # or: vi .env
```

Fill in the SMTP block with your mailbox details, e.g. for GoDaddy:

```
CONTACT_TO=business@incolosystems.com
CONTACT_FROM=noreply@incolosystems.com
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@incolosystems.com
SMTP_PASS=your-mailbox-password
```

Lock the file down so only you can read it:

```bash
chmod 600 .env
```

Quick test that the app runs:

```bash
node server.js
# In another SSH tab:  curl -I http://127.0.0.1:3000/
# You should get HTTP/1.1 200 OK. Press Ctrl+C to stop.
```

---

## 7. Run the app as a service (systemd)

So it starts on boot and restarts if it crashes:

```bash
sudo tee /etc/systemd/system/incolo.service > /dev/null <<'UNIT'
[Unit]
Description=Incolo Systems website (Node)
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/home/opc/incolo-site
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now incolo
sudo systemctl status incolo --no-pager    # should say "active (running)"
```

Logs later, if needed: `journalctl -u incolo -f`

---

## 8. Let SELinux allow nginx → Node (another gotcha)

Oracle Linux ships with SELinux enforcing, which by default blocks nginx from
connecting to your Node app. Allow it once:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

---

## 9. Point your domain at the server (DNS)

In your registrar's DNS panel, create these records (TTL 600 or default):

| Type | Name / Host | Value            |
|------|-------------|------------------|
| A    | `@`         | `YOUR_PUBLIC_IP` |
| A    | `www`       | `YOUR_PUBLIC_IP` |

Wait for it to propagate (usually minutes, up to an hour). Check from your Mac:

```bash
dig +short incolosystems.com
# should print YOUR_PUBLIC_IP
```

**Do not continue to SSL until this resolves** — Certbot verifies the domain by
connecting back to it, so DNS must point here first.

---

## 10. nginx reverse proxy

```bash
sudo tee /etc/nginx/conf.d/incolo.conf > /dev/null <<'CONF'
server {
    listen 80;
    listen [::]:80;
    server_name incolosystems.com www.incolosystems.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
CONF

# Oracle Linux's default nginx.conf has its own server block on port 80 —
# comment it out to avoid a clash, or it's fine to leave since server_name wins.
sudo nginx -t                 # test config syntax
sudo systemctl reload nginx
```

Now `http://incolosystems.com` should show your site (still plain HTTP).

---

## 11. Free SSL with Certbot

Install Certbot (needs the EPEL repo):

```bash
sudo dnf install -y oracle-epel-release-el9 || sudo dnf install -y epel-release
sudo dnf install -y certbot python3-certbot-nginx
```
If above errors out try below:
```sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm
sudo dnf install -y certbot python3-certbot-nginx```

Get and install the certificate — this edits your nginx config automatically,
adds the HTTPS (443) server block, and sets up HTTP→HTTPS redirect:

```bash
sudo certbot --nginx -d incolosystems.com -d www.incolosystems.com
```

- Enter an email for renewal notices.
- Agree to the terms.
- When asked about redirecting HTTP to HTTPS, choose **Redirect (2)**.

Certbot installs a systemd timer that auto-renews before expiry. Confirm it:

```bash
sudo systemctl list-timers | grep certbot     # a timer should be listed
sudo certbot renew --dry-run                   # should say "success"
```

---

## 12. Verify

- Open `https://incolosystems.com` — padlock, no warning. ✅
- `http://incolosystems.com` should auto-redirect to `https://`. ✅
- Submit the contact form → the "Thank you" message appears, the email arrives
  at `CONTACT_TO`, and a line is appended to `leads.jsonl` on the server.

---

## 13. Migrating to incolo.si (new primary domain)

`incolo.si` (bought from **Hostinger**) is the new primary address; `incolosystems.com`
(**GoDaddy**) stays live until `incolo.si` is verified, then redirects to it. The site code
already uses `https://incolo.si/` as its canonical/SEO URL — only DNS + nginx + the TLS
cert change on the server. **No code redeploy is needed between the two phases below.**

### Phase 1 — serve both domains (test incolo.si, keep .com working)

1. **Point incolo.si DNS at the same VM** (Hostinger → *Domains → incolo.si → DNS / Name
   Servers*; keep Hostinger's default nameservers and edit the DNS zone there):
   - `A` record, host `@`  → **VM public IP** (same IP the .com uses)
   - `A` record, host `www` → **VM public IP**
   Leave GoDaddy's `incolosystems.com` records untouched. Confirm propagation:
   ```bash
   dig +short incolo.si
   dig +short www.incolo.si
   ```
   Both must return the VM IP before continuing (Certbot verifies by connecting back).

2. **Add incolo.si to the nginx server block** — edit `server_name` in
   `/etc/nginx/conf.d/incolo.conf` so all four names are served:
   ```nginx
   server_name incolosystems.com www.incolosystems.com incolo.si www.incolo.si;
   ```
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. **Extend the TLS certificate to cover incolo.si** (one combined cert):
   ```bash
   sudo certbot --nginx \
     -d incolosystems.com -d www.incolosystems.com \
     -d incolo.si -d www.incolo.si
   ```
   Choose **Redirect (2)** again. Now `https://incolo.si` serves the site with a valid
   padlock, and `https://incolosystems.com` keeps working — both live.

4. **Test incolo.si end to end:** padlock OK, pages load, contact form delivers email +
   appends to `leads.jsonl`. (If you added SPF/DKIM, note mail still sends via the
   existing `@incolosystems.com` SMTP — unchanged.)

### Phase 2 — cut over: redirect incolosystems.com → incolo.si

Once incolo.si is verified, make `incolosystems.com` 301-redirect to `incolo.si`. Keep the
combined cert (it still covers .com, so the HTTPS redirect is valid). Replace the contents
of `/etc/nginx/conf.d/incolo.conf` so the .com names redirect and only incolo.si serves
the app (Certbot-managed `ssl_certificate` lines from Phase 1 are preserved — keep them):

```nginx
# Redirect the old domain (both http + https) to the new one
server {
    listen 80;  listen [::]:80;
    listen 443 ssl; listen [::]:443 ssl;
    server_name incolosystems.com www.incolosystems.com;
    # ssl_certificate / ssl_certificate_key: keep the Certbot lines already here
    return 301 https://incolo.si$request_uri;
}

# Normalise www.incolo.si → apex, and serve the app on apex
server {
    listen 443 ssl; listen [::]:443 ssl;
    server_name www.incolo.si;
    # same Certbot ssl_certificate lines
    return 301 https://incolo.si$request_uri;
}
server {
    listen 80;  listen [::]:80;
    listen 443 ssl; listen [::]:443 ssl;
    server_name incolo.si;
    # same Certbot ssl_certificate lines

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

Verify: `https://incolosystems.com` and `www.incolo.si` both 301 to `https://incolo.si`.
Keep renewing the .com cert (don't cancel it) so the redirect's HTTPS stays valid, and
keep the GoDaddy domain registered/pointed at the VM for the redirect to work.

> **Email is unchanged:** mailboxes stay on `@incolosystems.com`; only the public contact
> address shown on the site changed to `business@incolosystems.com`. Set
> `CONTACT_TO=business@incolosystems.com` in the server's `.env` so enquiries route there.

---

## Updating the site later

```bash
cd /home/opc/incolo-site
git pull                       # or scp the changed files
npm install --omit=dev         # only if dependencies changed
sudo systemctl restart incolo
```

Static-only edits (HTML/CSS/images) still need a `restart` because Node serves
them, or they'll be picked up on next restart. nginx does not need reloading for
content changes — only for config/SSL changes.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Site unreachable at the IP | OCI ingress rules for 80/443 missing (step 1), or firewalld (step 3). |
| `502 Bad Gateway` from nginx | Node app not running (`systemctl status incolo`) **or** SELinux blocking (step 8). |
| Certbot fails to verify | DNS not pointing to the server yet (step 9), or port 80 closed. |
| Form shows success but no email | Wrong SMTP creds in `.env`; check `journalctl -u incolo` for "mail send failed". The lead is still saved in `leads.jsonl`. |
| Email lands in spam | Add SPF and DKIM DNS records for your domain at your mail provider. |
