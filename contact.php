<?php
/**
 * Incolo Systems — contact form handler.
 *
 * Runs on standard GoDaddy cPanel (Linux) hosting with PHP. No third-party
 * service, no tracker. Emails each enquiry to the address in $TO below and
 * keeps a local JSONL backup so a lead is never lost even if mail is delayed.
 *
 * Works two ways automatically:
 *   - JavaScript on the page POSTs via fetch and shows an inline success message.
 *   - With JS off, the same POST returns a simple thank-you HTML page.
 */

// ------------------------------------------------------------------ settings
$TO        = 'gaurav.dua@incolosystems.com';        // where enquiries are sent
$FROM      = 'noreply@incolosystems.com';           // must be a mailbox ON your domain
$SUBJECT   = 'New enquiry — incolosystems.com';
$BACKUP    = __DIR__ . '/leads.jsonl';              // local backup (keep outside web root if possible)
// ---------------------------------------------------------------------------

// Detect whether the browser expects JSON (fetch) or a full page (no-JS).
$wantsJson = (
  (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'fetch') ||
  (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false)
);

function respond($ok, $message, $wantsJson, $code = 200) {
  http_response_code($code);
  if ($wantsJson) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => $ok, 'message' => $message]);
  } else {
    header('Content-Type: text/html; charset=utf-8');
    $title = $ok ? 'Thank you' : 'Something went wrong';
    echo "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
       . "<meta name='viewport' content='width=device-width, initial-scale=1'>"
       . "<title>$title — Incolo Systems</title>"
       . "<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#f7fafd;color:#14324f;"
       . "display:grid;place-items:center;min-height:100vh;margin:0;padding:2rem;text-align:center}"
       . "a{color:#1d65cc}</style></head><body><div><h1>$title</h1><p>"
       . htmlspecialchars($message, ENT_QUOTES) . "</p><p><a href='/'>&larr; Back to home</a></p></div></body></html>";
  }
  exit;
}

// Only accept POST.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  respond(false, 'Method not allowed.', $wantsJson, 405);
}

// Honeypot — if a bot filled the hidden "website" field, silently accept & drop.
if (!empty($_POST['website'])) {
  respond(true, 'Thank you — we will be in touch shortly.', $wantsJson);
}

// Collect + trim.
$name    = trim($_POST['name']    ?? '');
$company = trim($_POST['company'] ?? '');
$email   = trim($_POST['email']   ?? '');
$phone   = trim($_POST['phone']   ?? '');
$message = trim($_POST['message'] ?? '');

// Validate.
$errors = [];
if ($name === '')                                    $errors[] = 'name';
if ($company === '')                                 $errors[] = 'company';
if (!filter_var($email, FILTER_VALIDATE_EMAIL))      $errors[] = 'a valid work email';
if ($message === '')                                 $errors[] = 'a short message';
if ($errors) {
  respond(false, 'Please add ' . implode(', ', $errors) . '.', $wantsJson, 422);
}

// Guard against header injection via the email field.
if (preg_match('/[\r\n]/', $email . $name)) {
  respond(false, 'Invalid input.', $wantsJson, 422);
}

// Build the email.
$body =
  "New enquiry from the Incolo Systems website\n" .
  "-------------------------------------------\n" .
  "Name:    $name\n" .
  "Company: $company\n" .
  "Email:   $email\n" .
  "Phone:   " . ($phone !== '' ? $phone : '—') . "\n" .
  "Time:    " . date('Y-m-d H:i:s') . " (server)\n" .
  "IP:      " . ($_SERVER['REMOTE_ADDR'] ?? '—') . "\n\n" .
  "Message:\n$message\n";

$headers  = "From: Incolo Systems <$FROM>\r\n";
$headers .= "Reply-To: $name <$email>\r\n";
$headers .= "Content-Type: text/plain; charset=utf-8\r\n";
$headers .= "X-Mailer: PHP/incolo-contact\r\n";

// Always write a local backup first (never lose a lead).
@file_put_contents(
  $BACKUP,
  json_encode(compact('name', 'company', 'email', 'phone', 'message') + ['ts' => date('c')]) . "\n",
  FILE_APPEND | LOCK_EX
);

// Send.
$sent = @mail($TO, $SUBJECT, $body, $headers, "-f$FROM");

if ($sent) {
  respond(true, 'Thank you — your enquiry is on its way. We usually reply within one business day.', $wantsJson);
} else {
  // Mail failed but the backup is saved; treat as soft success for the visitor.
  respond(true, 'Thank you — we have received your enquiry and will be in touch shortly.', $wantsJson);
}
