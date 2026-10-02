/**
 * Incolo Systems — Node.js server.
 *
 * Serves the static marketing site and handles the contact form.
 * Designed to sit behind nginx (which terminates TLS) on an OCI VM, but also
 * runs stand-alone for local testing.
 *
 * No third-party runtime calls except the SMTP relay used to send enquiry email.
 * All configuration and secrets come from environment variables (see .env.example).
 */

'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();

// ------------------------------------------------------------------ settings
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1'; // bind to localhost; nginx is the public face

const TO = process.env.CONTACT_TO || 'business@incolosystems.com';
const FROM = process.env.CONTACT_FROM || 'noreply@incolosystems.com';
const SUBJECT = process.env.CONTACT_SUBJECT || 'New enquiry — incolo.si';
const BACKUP = process.env.LEADS_FILE || path.join(__dirname, 'leads.jsonl');

// SMTP (authenticated send). Fill these in .env.
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true') === 'true'; // true for 465, false for 587
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// Trust the nginx proxy so req.ip reflects the real client address.
app.set('trust proxy', 1);

// One reusable SMTP transport.
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

// ---------------------------------------------------------------- helpers
function wantsJson(req) {
  const xrw = (req.get('x-requested-with') || '').toLowerCase();
  const accept = req.get('accept') || '';
  return xrw === 'fetch' || accept.indexOf('application/json') !== -1;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function respond(req, res, ok, message, code) {
  res.status(code || 200);
  if (wantsJson(req)) {
    return res.json({ ok: ok, message: message });
  }
  const title = ok ? 'Thank you' : 'Something went wrong';
  res.type('html').send(
    "<!doctype html><html lang='en'><head><meta charset='utf-8'>" +
      "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
      '<title>' + title + ' — Incolo Systems</title>' +
      '<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#f7fafd;color:#14324f;' +
      'display:grid;place-items:center;min-height:100vh;margin:0;padding:2rem;text-align:center}' +
      'a{color:#1d65cc}</style></head><body><div><h1>' + title + '</h1><p>' +
      escapeHtml(message) + "</p><p><a href='/'>&larr; Back to home</a></p></div></body></html>"
  );
}

// ---------------------------------------------------------------- contact API
app.post('/api/contact', express.urlencoded({ extended: false }), async function (req, res) {
  const b = req.body || {};

  // Honeypot — a bot filled the hidden "website" field. Silently accept & drop.
  if (b.website) {
    return respond(req, res, true, 'Thank you — we will be in touch shortly.');
  }

  const name = String(b.name || '').trim();
  const company = String(b.company || '').trim();
  const email = String(b.email || '').trim();
  const phone = String(b.phone || '').trim();
  const message = String(b.message || '').trim();

  // Validate.
  const errors = [];
  if (name === '') errors.push('name');
  if (company === '') errors.push('company');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('a valid work email');
  if (message === '') errors.push('a short message');
  if (errors.length) {
    return respond(req, res, false, 'Please add ' + errors.join(', ') + '.', 422);
  }

  // Guard against header injection via the email/name fields.
  if (/[\r\n]/.test(email + name)) {
    return respond(req, res, false, 'Invalid input.', 422);
  }

  // Always write a local backup first (never lose a lead).
  try {
    fs.appendFileSync(
      BACKUP,
      JSON.stringify({ name, company, email, phone, message, ts: new Date().toISOString() }) + '\n'
    );
  } catch (e) {
    console.error('leads backup failed:', e.message);
  }

  // Build + send the email.
  const text =
    'New enquiry from the Incolo Systems website\n' +
    '-------------------------------------------\n' +
    'Name:    ' + name + '\n' +
    'Company: ' + company + '\n' +
    'Email:   ' + email + '\n' +
    'Phone:   ' + (phone !== '' ? phone : '—') + '\n' +
    'Time:    ' + new Date().toISOString() + '\n' +
    'IP:      ' + (req.ip || '—') + '\n\n' +
    'Message:\n' + message + '\n';

  try {
    await transporter.sendMail({
      from: 'Incolo Systems <' + FROM + '>',
      to: TO,
      replyTo: name + ' <' + email + '>',
      subject: SUBJECT,
      text: text,
    });
    return respond(
      req,
      res,
      true,
      'Thank you — your enquiry is on its way. We usually reply within one business day.'
    );
  } catch (e) {
    // Mail failed but the backup is saved; treat as soft success for the visitor.
    console.error('mail send failed:', e.message);
    return respond(
      req,
      res,
      true,
      'Thank you — we have received your enquiry and will be in touch shortly.'
    );
  }
});

// ---------------------------------------------------------------- static site
// Never serve server-side files over HTTP.
const BLOCKED = /^\/(server\.js|package(-lock)?\.json|\.env.*|leads\.jsonl|contact\.php|README\.md|node_modules(\/|$))/i;
app.use(function (req, res, next) {
  if (BLOCKED.test(req.path)) return res.status(404).send('Not found');
  next();
});

app.use(
  express.static(__dirname, {
    dotfiles: 'deny',
    extensions: ['html'],
    setHeaders: function (res, filePath) {
      if (/\.(woff2|css|js|png|jpg|jpeg|webp|svg|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days for static assets
      }
    },
  })
);

// Fallback: anything unmatched → the site's own 404 page if present, else a plain 404.
app.use(function (req, res) {
  const notFound = path.join(__dirname, '404.html');
  if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);
  res.status(404).send('Not found');
});

app.listen(PORT, HOST, function () {
  console.log('Incolo site listening on http://' + HOST + ':' + PORT);
});
