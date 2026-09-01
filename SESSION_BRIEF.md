# Session Brief

Snapshot of the current state so any future update can begin from here.
_Last updated: 2026-08-29._

## Current state

The Incolo Systems marketing site has been converted from a PHP static-hosting
setup to a **Node/Express app deployed on an Oracle Cloud (OCI) VM**, served behind
nginx with a free Let's Encrypt (Certbot) certificate. Deployment to the OCI server
is **in progress** — the app and docs are ready; SSL was the last live step.

## Key decisions

- **Host:** Oracle Cloud (OCI) VM, **Oracle Linux 9**, login user `opc`. Replaces the
  earlier GoDaddy/PHP plan.
- **Backend:** PHP `contact.php` was ported to **Node/Express** (`server.js`). PHP file
  is kept for reference but is **no longer used**.
- **Architecture:** nginx terminates TLS on 80/443 and reverse-proxies to Node on
  `127.0.0.1:3000`. Node runs as a systemd service (`incolo.service`).
- **SSL:** **Certbot** (Let's Encrypt), free and auto-renewing, via `certbot --nginx`
  with HTTP→HTTPS redirect.
- **Email:** authenticated **SMTP via Nodemailer**; config/secrets in `.env`.
- **Hard constraints (unchanged):** zero third-party runtime requests except the SMTP
  relay; `.env` secrets never committed; `leads.jsonl` stays private (gitignored +
  blocked from web access).

## Files changed / added

| File | Status | Notes |
|---|---|---|
| `server.js` | added | Express app: serves site + `POST /api/contact`; honeypot, validation, `leads.jsonl` backup, Nodemailer send. Committed in `50de7f8`. |
| `package.json` / `package-lock.json` | added | deps: express, nodemailer, dotenv. Committed. |
| `.env.example` | added | config template (SMTP block); copy to `.env` on server. Committed. |
| `.gitignore` | edited | ignores `.env`, `node_modules/`, `leads.jsonl`, `*.zip`, etc. Committed. |
| `index.html` | edited | form `action` → `/api/contact`. Committed. |
| `DEPLOY-OCI.md` | added | authoritative OCI deploy runbook (incl. Certbot). Committed. |
| `README.md` | **modified (uncommitted)** | rewritten for the Node/OCI + Certbot flow. |
| `CLAUDE.md` | **untracked** | repo guidance for future sessions. |
| `SESSION_BRIEF.md` | **untracked** | this file. |

Last commit: `50de7f8 Add Node/Express server for OCI deployment`.
`README.md`, `CLAUDE.md`, and `SESSION_BRIEF.md` are **not yet committed**.

## Authoritative references

- **`DEPLOY-OCI.md`** — full step-by-step deploy runbook (the source of truth).
- **`CLAUDE.md`** — architecture + hard constraints for anyone working in the repo.
- **`README.md`** — project overview + condensed deploy/SSL steps.

## Next steps

1. **Finish SSL on the server.** Certbot install hit a missing-EPEL error; fix is in
   `DEPLOY-OCI.md` §11 / README (`oracle-epel-release-el9`, enable
   `ol9_developer_EPEL`, `makecache`, then install `certbot python3-certbot-nginx`),
   then `sudo certbot --nginx -d <domain> -d www.<domain>` and choose Redirect.
2. **Verify end to end:** `https://<domain>` shows a padlock, HTTP redirects to HTTPS,
   and a test form submission delivers email to `CONTACT_TO` + appends to `leads.jsonl`.
3. **Confirm real domain** — runbook uses `incolosystems.com` as the example; the
   purchased domain may differ. Update DNS A records (`@`, `www`) → VM public IP.
4. **Fill exact SMTP settings** in `.env` on the server once the `@incolosystems.com`
   mailbox host is confirmed (GoDaddy / M365 / Google examples are in `.env.example`).
5. **Commit the docs:** `README.md`, `CLAUDE.md`, `SESSION_BRIEF.md`.
6. **Deliverability (optional):** add SPF/DKIM DNS records to keep enquiry mail out of
   spam.

## Gotchas to remember

- OCI VCN Security List must allow ingress TCP **80/443** — site is unreachable otherwise.
- SELinux blocks nginx→Node until `setsebool -P httpd_can_network_connect 1`.
- DNS must resolve to the VM **before** running Certbot (it verifies by connecting back).
