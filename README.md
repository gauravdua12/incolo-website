# Incolo Systems — website (static)

A single-page static marketing site for **Incolo Systems** — private, on-edge,
agentic AI for industrial manufacturing.

Light, airy, blue-toned design. **Zero third-party requests at runtime** — fonts,
scripts, and icons are all served from this folder. No build step, no server, no
tracker.

## Contents

```
index.html            the whole page
styles/
  tokens.css          design tokens (colour, type, spacing, motion)
  fonts.css           @font-face for the 3 self-hosted fonts
  main.css            all component + layout styles
js/main.js            header state, mobile menu, scroll-reveal, footer year
fonts/                Space Grotesk + Inter + IBM Plex Mono (woff2, latin)
media/mark.svg        logo mark (also inlined in the page)
favicon.svg           browser tab icon
robots.txt sitemap.xml
```

## Preview locally

It's plain files — open `index.html` in a browser, or serve the folder:

```bash
cd site
python3 -m http.server 8080    # then visit http://localhost:8080
```

## Editing

- **Copy** lives directly in `index.html` (well-commented sections).
- **Colours / spacing / fonts**: `styles/tokens.css`.
- **Contact form** posts to `contact.php`, which emails each enquiry to
  `gaurav.dua@incolosystems.com` and keeps a local `leads.jsonl` backup. See
  "Making the form send email" below.

## Deploy to GoDaddy

Upload the **contents of `site/`** to your web root (`public_html/`) via
cPanel → File Manager (or SFTP). `index.html` must sit at the root. That's the
whole site — no Node app, no build.

## Making the form send email

The form works out of the box on standard **GoDaddy cPanel (Linux) hosting**,
which runs PHP. Steps:

1. **Create the sender mailbox.** In cPanel → *Email Accounts*, create
   `noreply@incolosystems.com` (any mailbox on your own domain works). Mail sent
   *from* an address on your domain is far less likely to be marked as spam.
2. **Check `contact.php`.** Open it and confirm the two lines at the top:
   - `$TO`   = where enquiries arrive (`gaurav.dua@incolosystems.com`)
   - `$FROM` = the mailbox you just made (`noreply@incolosystems.com`)
3. **Upload** the `site/` contents (including `contact.php`) to `public_html/`.
4. **Test** by submitting the form on the live site. You should see the inline
   "Thank you" message, and the enquiry should arrive in the `$TO` inbox.
   Every submission is also appended to `leads.jsonl` as a backup.

Notes:
- With JavaScript on, the form submits without reloading and shows an inline
  status. With JS off, it still posts and shows a thank-you page — both paths
  hit the same `contact.php`.
- A hidden honeypot field blocks basic spam bots. No captcha, no third party.
- For best deliverability, add an **SPF/DKIM** record for the domain (GoDaddy
  → *DNS*), or upgrade `contact.php` to send over authenticated SMTP with
  PHPMailer using the mailbox's credentials.
- Keep `leads.jsonl` private — it is a plain-text backup of submissions. If your
  host allows it, move `$BACKUP` to a path outside `public_html/`.

### If your plan has no PHP (alternative, no backend)

Use a form-to-email relay such as **Web3Forms** or **FormSubmit** (free):
sign up, get an endpoint URL, and change the form's
`action="contact.php"` to that URL. This adds one third-party request on submit
only (still no tracker). Or restore the previous **Express + Nodemailer**
backend from git history and run it as a cPanel Node.js app.
