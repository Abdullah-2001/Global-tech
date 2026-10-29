/* =====================================================================
   GLOBAL TECH MARKETING — Email API (Node + Gmail / nodemailer)
   ---------------------------------------------------------------------
   Sirf API. Koi HTML / assets serve nahi hota — website alag host hoti hai.
   Saari settings neeche CONFIG mein hain — .env ki zaroorat nahi.

   Endpoints
     POST /api/contact          customer query -> team email + customer confirmation
     GET  /api/health           server + mail status
     GET  /api/email-preview    ?type=owner|client  (sirf development mein)

   Local chalane ke liye:  npm install   ->   node server.js
   Vercel par:  api/[...path].js is file ka handler export karta hai (deploy steps alag diye hain)
   Test bina email bheje:  dryRun ko true kar dein (neeche CONFIG mein)
   ===================================================================== */

import http from 'node:http';

let nodemailer = null;
try { nodemailer = (await import('nodemailer')).default; }
catch { console.warn('[mail] nodemailer install nahi hai. Run: npm install nodemailer'); }

const ON_VERCEL = Boolean(process.env.VERCEL);

const CONFIG = {
  port: 3000,
  user: 'globaltechmarketing.co@gmail.com',      // Gmail jisse emails jayengi
  pass: 'fvuhiqksspymsdtw',                      // Google App Password (spaces ke baghair)
  to: 'globaltechmarketing.co@gmail.com',        // jahan customer queries aayengi
  siteUrl: 'https://global-tech-one.vercel.app', // live website URL
  origins: ['https://global-tech-one.vercel.app'], // sirf ye website API use kar sakti hai
  trustProxy: true,                              // Vercel proxy ke peeche hai (asli visitor IP ke liye)
  tz: 'Asia/Karachi',
  dryRun: false,                                 // true = emails bheji nahi jayengi (sirf test)
  isProd: true,                                  // live server (email-preview band). Local test: false
  brand: 'Global Tech Marketing',
  tagline: 'Branding • Digital Growth • Landmark Design'
};

/* =====================================================================
   HELPERS
   ===================================================================== */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const oneLine = s => String(s).replace(/[\r\n]+/g, ' ');
const nl2br = s => esc(s).replace(/\r?\n/g, '<br>');
const trunc = (s, n) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function makeRef() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
  return 'GTM-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + rnd;
}
function fmtTime(date) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: CONFIG.tz, timeZoneName: 'short'
    }).format(date);
  } catch { return date.toUTCString(); }
}

/* =====================================================================
   EMAIL TEMPLATES  (table-based, inline styles, Gmail / Outlook / Apple
   Mail safe, mobile responsive, dark-mode aware, plain-text included)
   ===================================================================== */
const C = {
  navy: '#031a36', blue: '#073c78', accent: '#2f8cff', sky: '#8bc7ff',
  ink: '#0b1b2e', muted: '#5f7088', line: '#e3ebf5', bg: '#eef3f9', soft: '#f6f9fd', white: '#ffffff'
};
const FONT = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

function button(href, label, kind) {
  const primary = kind !== 'ghost';
  const bg = primary ? C.accent : C.white;
  const color = primary ? '#ffffff' : C.blue;
  const border = primary ? C.accent : '#c5d8ee';
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;border-collapse:separate;margin:0 8px 10px 0"><tr>' +
    '<td align="center" bgcolor="' + bg + '" style="border-radius:999px;border:1.5px solid ' + border + ';mso-padding-alt:0">' +
    '<a href="' + esc(href) + '" target="_blank" style="display:inline-block;padding:13px 24px;font-family:' + FONT + ';font-size:15px;font-weight:700;line-height:1;color:' + color + ';text-decoration:none;border-radius:999px">' + esc(label) + '</a>' +
    '</td></tr></table>';
}

function detailRow(label, valueHtml, last) {
  return '<tr>' +
    '<td class="dm-muted stack" valign="top" style="padding:13px 0;' + (last ? '' : 'border-bottom:1px solid ' + C.line + ';') + 'width:128px;font-family:' + FONT + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + C.muted + '">' + label + '</td>' +
    '<td class="dm-text stack" valign="top" style="padding:13px 0;' + (last ? '' : 'border-bottom:1px solid ' + C.line + ';') + 'font-family:' + FONT + ';font-size:15.5px;line-height:1.5;color:' + C.ink + '">' + valueHtml + '</td>' +
    '</tr>';
}
const dash = '<span style="color:#9aa8ba">—</span>';

function step(n, title, text, last) {
  return '<tr><td valign="top" width="44" style="padding:0 0 ' + (last ? '0' : '18px') + '">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="32" height="32" bgcolor="' + C.blue + '" style="border-radius:50%;width:32px;height:32px;font-family:' + FONT + ';font-size:14px;font-weight:700;color:#ffffff">' + n + '</td></tr></table></td>' +
    '<td valign="top" style="padding:0 0 ' + (last ? '0' : '18px') + '">' +
    '<div class="dm-text" style="font-family:' + FONT + ';font-size:16px;font-weight:700;color:' + C.navy + ';line-height:1.3">' + title + '</div>' +
    '<div class="dm-muted" style="font-family:' + FONT + ';font-size:14.5px;line-height:1.55;color:' + C.muted + ';margin-top:2px">' + text + '</div></td></tr>';
}

function layout(o) {
  const pre = esc(o.preheader || '') + '&#847;&zwnj;&nbsp;'.repeat(40);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">' +
    '<title>' + esc(o.title) + '</title>' +
    '<style>' +
    'body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}' +
    'table{border-collapse:collapse}img{border:0}a{color:' + C.accent + '}' +
    '@media (max-width:620px){.container{width:100%!important}.px{padding-left:22px!important;padding-right:22px!important}.stack{display:block!important;width:100%!important;border-bottom:0!important}.h1{font-size:28px!important}.gap-m{padding-top:14px!important}}' +
    '@media (prefers-color-scheme:dark){.dm-bg{background:#0a1423!important}.dm-card{background:#101e33!important}.dm-text{color:#e8f0fc!important}.dm-muted{color:#9db2d0!important}.dm-soft{background:#0d1a2d!important}.dm-line{border-color:#22344f!important}}' +
    '</style></head>' +
    '<body class="dm-bg" style="margin:0;padding:0;background:' + C.bg + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">' + pre + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-bg" bgcolor="' + C.bg + '"><tr><td align="center" style="padding:28px 12px 36px">' +
    '<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">' +

    /* wordmark */
    '<tr><td style="padding:0 6px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td align="center" valign="middle" width="34" height="34" bgcolor="' + C.blue + '" style="width:34px;height:34px;border-radius:9px;font-family:' + FONT + ';font-size:18px;font-weight:800;color:#ffffff">G</td>' +
    '<td style="padding-left:11px;font-family:' + FONT + ';font-size:13px;font-weight:800;letter-spacing:.14em;color:' + C.navy + '" class="dm-text">GLOBAL TECH MARKETING</td>' +
    '</tr></table></td></tr>' +

    /* card */
    '<tr><td class="dm-card" bgcolor="' + C.white + '" style="background:' + C.white + ';border-radius:20px;overflow:hidden;border:1px solid ' + C.line + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +

    /* hero */
    '<tr><td class="px" bgcolor="' + C.navy + '" style="background:' + C.navy + ';background-image:linear-gradient(135deg,#031a36 0%,#073c78 100%);padding:34px 36px 32px">' +
    '<div style="font-family:' + FONT + ';font-size:12px;font-weight:700;letter-spacing:.18em;color:' + C.sky + '">' + esc(o.eyebrow) + '</div>' +
    '<div class="h1" style="font-family:' + FONT + ';font-size:32px;line-height:1.15;font-weight:800;color:#ffffff;margin-top:10px;letter-spacing:-.5px">' + o.heading + '</div>' +
    (o.sub ? '<div style="font-family:' + FONT + ';font-size:15.5px;line-height:1.55;color:#c3d8f2;margin-top:12px">' + o.sub + '</div>' : '') +
    '</td></tr>' +

    /* body */
    '<tr><td class="px" style="padding:30px 36px 34px">' + o.body + '</td></tr>' +
    '</table></td></tr>' +

    /* footer */
    '<tr><td align="center" style="padding:24px 16px 0;font-family:' + FONT + ';font-size:12.5px;line-height:1.7;color:#7a8ca5" class="dm-muted">' + o.footer + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

/* ---------- 1) OWNER NOTIFICATION (team ko) ---------- */
function ownerEmail(d, ref, when) {
  const first = d.name.split(/\s+/)[0];
  const replySubject = 'Re: Your enquiry [' + ref + '] — ' + d.project;
  const replyBody = 'Hi ' + first + ',\n\nThank you for reaching out to ' + CONFIG.brand + '.\n\n';
  const replyHref = 'mailto:' + d.email + '?subject=' + encodeURIComponent(replySubject) + '&body=' + encodeURIComponent(replyBody);

  const actions = button(replyHref, 'Reply to ' + first + ' →') +
    (d.phone ? button('tel:' + d.phone.replace(/[^\d+]/g, ''), 'Call ' + d.phone, 'ghost') : '');

  const body =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>' +
    '<span style="display:inline-block;background:#e8f2ff;color:' + C.blue + ';font-family:' + FONT + ';font-size:12px;font-weight:700;letter-spacing:.06em;padding:6px 12px;border-radius:999px">REF ' + esc(ref) + '</span>' +
    '<span class="dm-muted" style="font-family:' + FONT + ';font-size:13px;color:' + C.muted + ';margin-left:10px">Received ' + esc(when) + '</span>' +
    '</td></tr><tr><td style="padding:22px 0 8px">' + actions + '</td></tr></table>' +

    '<div class="dm-text" style="font-family:' + FONT + ';font-size:13px;font-weight:800;letter-spacing:.14em;color:' + C.navy + ';margin:14px 0 4px">CUSTOMER DETAILS</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    detailRow('Name', esc(d.name)) +
    detailRow('Company', d.company ? esc(d.company) : dash) +
    detailRow('Email', '<a href="mailto:' + esc(d.email) + '" style="color:' + C.accent + ';text-decoration:none;font-weight:600">' + esc(d.email) + '</a>') +
    detailRow('Phone', d.phone ? '<a href="tel:' + esc(d.phone.replace(/[^\d+]/g, '')) + '" style="color:' + C.accent + ';text-decoration:none;font-weight:600">' + esc(d.phone) + '</a>' : dash) +
    detailRow('Project type', '<strong>' + esc(d.project) + '</strong>') +
    detailRow('Location', d.location ? esc(d.location) : dash, true) +
    '</table>' +

    '<div class="dm-text" style="font-family:' + FONT + ';font-size:13px;font-weight:800;letter-spacing:.14em;color:' + C.navy + ';margin:30px 0 10px">THEIR MESSAGE</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="4" bgcolor="' + C.accent + '" style="width:4px;background:' + C.accent + ';border-radius:4px"></td>' +
    '<td class="dm-soft dm-text" bgcolor="' + C.soft + '" style="background:' + C.soft + ';padding:18px 20px;border-radius:0 12px 12px 0;font-family:' + FONT + ';font-size:15.5px;line-height:1.7;color:' + C.ink + '">' + nl2br(d.message) + '</td>' +
    '</tr></table>' +

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px"><tr>' +
    '<td class="dm-soft dm-muted" bgcolor="#fff8e6" style="background:#fff8e6;border:1px solid #f6e3b0;border-radius:12px;padding:14px 16px;font-family:' + FONT + ';font-size:13.5px;line-height:1.55;color:#7a5a05">' +
    '<strong>Reminder:</strong> we promise every customer a reply within one business day. Hitting Reply sends your answer straight to ' + esc(first) + '.</td></tr></table>';

  const footer = esc(CONFIG.brand) + ' · Website enquiry notification<br>This email was generated automatically by your website contact form.';

  const html = layout({
    title: 'New enquiry ' + ref,
    preheader: d.name + ' — ' + d.project + (d.location ? ' · ' + d.location : ''),
    eyebrow: 'NEW CUSTOMER QUERY',
    heading: esc(d.project),
    sub: 'From <strong style="color:#ffffff">' + esc(d.name) + '</strong>' + (d.company ? ' · ' + esc(d.company) : ''),
    body, footer
  });

  const text = [
    'NEW CUSTOMER QUERY  [' + ref + ']',
    'Received: ' + when,
    '',
    'Name:     ' + d.name,
    'Company:  ' + (d.company || '-'),
    'Email:    ' + d.email,
    'Phone:    ' + (d.phone || '-'),
    'Project:  ' + d.project,
    'Location: ' + (d.location || '-'),
    '',
    'Message:',
    d.message,
    '',
    'Reply to this email to answer ' + d.name + ' directly.'
  ].join('\n');

  return { html, text };
}

/* ---------- 2) CUSTOMER CONFIRMATION (customer ko) ---------- */
function clientEmail(d, ref, when) {
  const first = d.name.split(/\s+/)[0];
  const filesHref = 'mailto:' + CONFIG.to + '?subject=' + encodeURIComponent('Files for enquiry [' + ref + ']') +
    '&body=' + encodeURIComponent('Hi team,\n\nPlease find my files attached for enquiry ' + ref + '.\n\n' + d.name);

  const body =
    '<p class="dm-text" style="margin:0 0 16px;font-family:' + FONT + ';font-size:16.5px;line-height:1.7;color:' + C.ink + '">Hi ' + esc(first) + ',</p>' +
    '<p class="dm-text" style="margin:0 0 22px;font-family:' + FONT + ';font-size:16.5px;line-height:1.7;color:' + C.ink + '">Thank you for reaching out. We have received your enquiry about <strong>' + esc(d.project) + '</strong> and a member of our team is already reviewing it. You will get a clear, practical reply from us within <strong>one business day</strong>.</p>' +

    /* reference card */
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td class="dm-soft" bgcolor="' + C.soft + '" style="background:' + C.soft + ';border:1px solid ' + C.line + ';border-radius:14px;padding:16px 20px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td class="stack" valign="top" style="font-family:' + FONT + ';font-size:12px;font-weight:700;letter-spacing:.1em;color:' + C.muted + '">YOUR REFERENCE<div class="dm-text" style="font-size:20px;font-weight:800;letter-spacing:.02em;color:' + C.navy + ';margin-top:4px">' + esc(ref) + '</div></td>' +
    '<td class="stack gap-m" valign="top" style="font-family:' + FONT + ';font-size:12px;font-weight:700;letter-spacing:.1em;color:' + C.muted + '">SUBMITTED<div class="dm-text" style="font-size:14.5px;font-weight:600;letter-spacing:0;color:' + C.ink + ';margin-top:7px">' + esc(when) + '</div></td>' +
    '</tr></table></td></tr></table>' +

    /* summary */
    '<div class="dm-text" style="font-family:' + FONT + ';font-size:13px;font-weight:800;letter-spacing:.14em;color:' + C.navy + ';margin:32px 0 4px">YOUR ENQUIRY AT A GLANCE</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    detailRow('Project', '<strong>' + esc(d.project) + '</strong>') +
    (d.company ? detailRow('Company', esc(d.company)) : '') +
    detailRow('Location', d.location ? esc(d.location) : dash) +
    detailRow('Your note', '<span class="dm-muted" style="color:' + C.muted + '">' + nl2br(trunc(d.message, 380)) + '</span>', true) +
    '</table>' +

    /* next steps */
    '<div class="dm-text" style="font-family:' + FONT + ';font-size:13px;font-weight:800;letter-spacing:.14em;color:' + C.navy + ';margin:34px 0 16px">WHAT HAPPENS NEXT</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    step(1, 'We review your brief', 'Our strategists and designers study your goals, location and requirements.') +
    step(2, 'You receive a proposal', 'A clear scope, direction and next steps — within one business day.') +
    step(3, 'We talk it through', 'A short online discovery call to shape the concept together, wherever you are.', true) +
    '</table>' +

    /* speed-up box */
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:34px"><tr>' +
    '<td bgcolor="' + C.navy + '" style="background:' + C.navy + ';background-image:linear-gradient(135deg,#031a36,#073c78);border-radius:16px;padding:24px 24px 16px">' +
    '<div style="font-family:' + FONT + ';font-size:18px;font-weight:800;color:#ffffff;line-height:1.3">Want to speed things up?</div>' +
    '<div style="font-family:' + FONT + ';font-size:14.5px;line-height:1.65;color:#c3d8f2;margin:8px 0 16px">Simply reply to this email with any of the following:<br>' +
    '&bull;&nbsp; Your logo or existing brand files<br>&bull;&nbsp; Photos or a map pin of the location<br>&bull;&nbsp; Your preferred timeline or budget range</div>' +
    button(filesHref, 'Reply with files →') +
    '</td></tr></table>' +

    '<p class="dm-text" style="margin:30px 0 0;font-family:' + FONT + ';font-size:16px;line-height:1.7;color:' + C.ink + '">Warm regards,<br><strong>The ' + esc(CONFIG.brand) + ' Team</strong><br><span class="dm-muted" style="color:' + C.muted + ';font-size:14px">' + esc(CONFIG.tagline) + '</span></p>';

  const footer = esc(CONFIG.brand) + ' · ' + esc(CONFIG.tagline) + '<br>' +
    '<a href="mailto:' + esc(CONFIG.to) + '" style="color:#7a8ca5;text-decoration:underline">' + esc(CONFIG.to) + '</a>' +
    (CONFIG.siteUrl ? ' · <a href="' + esc(CONFIG.siteUrl) + '" style="color:#7a8ca5;text-decoration:underline">' + esc(CONFIG.siteUrl.replace(/^https?:\/\//, '')) + '</a>' : '') +
    '<br><span style="font-size:11.5px">You are receiving this because you submitted an enquiry on our website. If this was not you, you can safely ignore this email.</span>';

  const html = layout({
    title: 'We received your enquiry ' + ref,
    preheader: 'Thanks ' + first + ' — we have your brief and will reply within one business day. Ref ' + ref,
    eyebrow: 'ENQUIRY RECEIVED',
    heading: 'Thank you, ' + esc(first) + '.<br>We have your brief.',
    sub: 'Your message is with our team and a reply is on its way.',
    body, footer
  });

  const text = [
    'Hi ' + first + ',',
    '',
    'Thank you for contacting ' + CONFIG.brand + '. We received your enquiry about "' + d.project + '" and will reply with a clear proposal within one business day.',
    '',
    'Reference: ' + ref,
    'Submitted: ' + when,
    '',
    'WHAT HAPPENS NEXT',
    '1. We review your brief',
    '2. You receive a proposal (within one business day)',
    '3. We talk it through on a short online call',
    '',
    'To speed things up, reply with your logo / brand files, location photos or map pin, and your preferred timeline.',
    '',
    'Warm regards,',
    'The ' + CONFIG.brand + ' Team',
    CONFIG.tagline
  ].join('\n');

  return { html, text };
}

/* =====================================================================
   HTTP LAYER
   ===================================================================== */
const baseHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

function corsFor(req) {
  const origin = req.headers.origin;
  const h = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (CONFIG.origins.includes('*')) h['Access-Control-Allow-Origin'] = '*';
  else if (origin && CONFIG.origins.includes(origin)) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
  return h;
}

function send(res, status, body, headers) {
  res.writeHead(status, { ...baseHeaders, ...(res.cors || {}), ...(headers || {}) });
  res.end(body);
}
const sendJSON = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

/* ---------- rate limit (in-memory) ---------- */
const hits = new Map();
const WINDOW_MS = 15 * 60 * 1000, MAX_HITS = 5;
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_HITS) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr); return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const f = arr.filter(t => now - t < WINDOW_MS);
    if (f.length) hits.set(ip, f); else hits.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function clientIP(req) {
  if (CONFIG.trustProxy) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function readBody(req, limit) {
  /* Vercel body pehle hi parse kar deta hai (req.body) — stream dobara nahi padhi ja sakti */
  if (req.body !== undefined && req.body !== null) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8')
      : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    return raw.length > limit ? Promise.reject(new Error('too_large')) : Promise.resolve(raw);
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ---------- Gmail transport ---------- */
let transporter = null;
const mailReady = () => Boolean(nodemailer && (CONFIG.dryRun || (CONFIG.user && CONFIG.pass)));
function getTransporter() {
  if (!transporter) {
    transporter = CONFIG.dryRun
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: CONFIG.user, pass: CONFIG.pass },
        pool: !ON_VERCEL, maxConnections: 2
      });
  }
  return transporter;
}

/* ---------- POST /api/contact ---------- */
async function handleContact(req, res) {
  if (limited(clientIP(req))) {
    return sendJSON(res, 429, { ok: false, error: 'Too many enquiries from your connection. Please try again in a few minutes.' });
  }

  let raw;
  try { raw = await readBody(req, 20 * 1024); }
  catch { return sendJSON(res, 413, { ok: false, error: 'Your message is too large.' }); }

  let body;
  try { body = JSON.parse(raw); } catch { return sendJSON(res, 400, { ok: false, error: 'Invalid request.' }); }
  if (!body || typeof body !== 'object') return sendJSON(res, 400, { ok: false, error: 'Invalid request.' });

  /* honeypot: bots is field ko bharte hain — khamoshi se success dikhao */
  if (body.website) return sendJSON(res, 200, { ok: true });

  const d = {
    name: clean(body.name, 100), company: clean(body.company, 120), email: clean(body.email, 160),
    phone: clean(body.phone, 30), project: clean(body.project, 80), location: clean(body.location, 160),
    message: clean(body.message, 3000)
  };
  if (!d.name) return sendJSON(res, 400, { ok: false, error: 'Please enter your name.' });
  if (!EMAIL_RE.test(d.email)) return sendJSON(res, 400, { ok: false, error: 'Please enter a valid email address.' });
  if (!d.project) return sendJSON(res, 400, { ok: false, error: 'Please choose a project type.' });
  if (d.message.length < 10) return sendJSON(res, 400, { ok: false, error: 'Please describe your project (at least 10 characters).' });

  if (!mailReady()) {
    console.error('[mail] GMAIL_USER / GMAIL_APP_PASSWORD set nahi hain ya nodemailer missing hai.');
    return sendJSON(res, 503, { ok: false, error: 'Mail service not configured.' });
  }

  const ref = makeRef();
  const when = fmtTime(new Date());
  const owner = ownerEmail(d, ref, when);
  const fromAddr = CONFIG.user || 'no-reply@localhost';

  try {
    await getTransporter().sendMail({
      from: '"' + CONFIG.brand + ' Website" <' + fromAddr + '>',
      to: CONFIG.to,
      replyTo: '"' + oneLine(d.name).replace(/"/g, '') + '" <' + d.email + '>',
      subject: oneLine('[' + ref + '] New enquiry: ' + d.project + ' — ' + d.name),
      text: owner.text, html: owner.html,
      headers: { 'X-GTM-Ref': ref }
    });
  } catch (err) {
    console.error('[mail] send failed:', err && err.message);
    return sendJSON(res, 502, { ok: false, error: 'We could not send your enquiry right now. Please try again or email us directly.' });
  }

  /* customer confirmation — best effort (fail ho to bhi success), lekin response se
     pehle await hota hai kyunke Vercel response ke baad function rok deta hai */
  try {
    const client = clientEmail(d, ref, when);
    await getTransporter().sendMail({
      from: '"' + CONFIG.brand + '" <' + fromAddr + '>',
      to: d.email,
      replyTo: CONFIG.to,
      subject: 'We received your enquiry [' + ref + '] — ' + CONFIG.brand,
      text: client.text, html: client.html,
      headers: { 'X-GTM-Ref': ref, 'Auto-Submitted': 'auto-replied' }
    });
  } catch (e) { console.warn('[mail] customer confirmation failed:', e && e.message); }

  console.log('[mail] ' + ref + ' sent from ' + d.email + ' (' + d.project + ')' + (CONFIG.dryRun ? ' [DRY RUN]' : ''));
  return sendJSON(res, 200, { ok: true, ref });
}

/* ---------- GET /api/email-preview (development only) ---------- */
function handlePreview(url, res) {
  if (CONFIG.isProd) return sendJSON(res, 404, { ok: false, error: 'Not found.' });
  const type = new URL(url, 'http://x').searchParams.get('type') === 'owner' ? 'owner' : 'client';
  const sample = {
    name: 'Ayesha Khan', company: 'Khan Developers', email: 'ayesha@example.com', phone: '+92 300 1234567',
    project: 'Roundabout Design & Beautification', location: 'Hyderabad, Sindh',
    message: 'Assalam o Alaikum,\n\nWe are developing a new housing society and would like a landmark roundabout at the main entrance with night illumination and landscaping.\n\nCould you share a concept and a rough timeline?\n\nThanks!'
  };
  const mail = (type === 'owner' ? ownerEmail : clientEmail)(sample, 'GTM-261029-A7K2', fmtTime(new Date()));
  return send(res, 200, mail.html, { 'Content-Type': 'text/html; charset=utf-8' });
}

async function handler(req, res) {
  res.cors = corsFor(req);
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  /* sirf allowed website hi API use kar sakti hai (doosri sites ke forms block) */
  const origin = req.headers.origin;
  if (origin && !CONFIG.origins.includes('*') && !CONFIG.origins.includes(origin)) {
    return sendJSON(res, 403, { ok: false, error: 'Origin not allowed.' });
  }

  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (pathname === '/api/contact') {
    if (req.method === 'POST') {
      return handleContact(req, res).catch(e => {
        console.error('[server]', e); sendJSON(res, 500, { ok: false, error: 'Server error.' });
      });
    }
    return sendJSON(res, 405, { ok: false, error: 'Method not allowed.' });
  }
  if (pathname === '/api/health') return sendJSON(res, 200, { ok: true, mail: mailReady(), dryRun: CONFIG.dryRun });
  if (pathname === '/api/email-preview' && req.method === 'GET') return handlePreview(url, res);

  return sendJSON(res, 404, { ok: false, error: 'Not found.' });
}

export default handler;   /* Vercel serverless entry */

/* Local server — Vercel par listen nahi hota */
if (!ON_VERCEL) {
  const server = http.createServer(handler);
  server.listen(CONFIG.port, () => {
    console.log('\n  ' + CONFIG.brand + ' Email API → http://localhost:' + CONFIG.port);
    console.log('  Gmail: ' + (mailReady()
      ? (CONFIG.dryRun ? 'DRY RUN (emails bheji nahi jayengi)' : 'READY (' + CONFIG.user + ' → ' + CONFIG.to + ')')
      : 'NOT CONFIGURED (server.js ke CONFIG mein user + pass check karein, aur npm install chalayein)'));
    if (!CONFIG.isProd) console.log('  Template preview: /api/email-preview?type=client  |  ?type=owner');
    console.log('');
  });

  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}