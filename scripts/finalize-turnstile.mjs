import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const pub = path.join(process.cwd(), 'public');
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'turnstile.config.json'), 'utf8'));
const sitekey = process.env.TURNSTILE_SITE_KEY || config.sitekey;
if (!/^0x[A-Za-z0-9_-]+$/.test(sitekey || '')) throw new Error('A production Turnstile site key is required');
const runtime = fs.readFileSync(path.join(pub, 'brand/contact-turnstile.js'));
const hash = crypto.createHash('sha256').update(runtime).digest('hex').slice(0, 12);
const tag = `<script id="rr-contact-turnstile" src="/brand/contact-turnstile.js?v=${hash}" data-sitekey="${sitekey}"></script>`;
const privacy = '<section id="contact-turnstile-privacy"><h2>Contact form spam protection</h2><p>Cloudflare Turnstile protects contact forms from spam and automated abuse. This service processes browser and device signals to verify requests. See the <a href="https://www.cloudflare.com/turnstile-privacy-policy/" rel="noopener noreferrer">Cloudflare Turnstile Privacy Addendum</a> for details.</p></section>';
function walk(dir) { return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
let protectedPages = 0;
for (const file of walk(pub).filter(file => file.endsWith('.html'))) {
  let html = fs.readFileSync(file, 'utf8');
  const original = html;
  html = html.replace(/<script\b[^>]*\bid=["']rr-contact-turnstile["'][^>]*>[\s\S]*?<\/script>/gi, '');
  if (/<form\b[^>]*\baction=["'](?:https?:\/\/[^/]+)?\/api\/contact["']/i.test(html)) {
    if (!/<head\b[^>]*>/i.test(html)) throw new Error('Contact page missing head: ' + file);
    html = html.replace(/(<head\b[^>]*>)/i, '$1' + tag);
    protectedPages++;
  }
  if (path.basename(file) === 'privacy.html' && !html.includes('id="contact-turnstile-privacy"')) {
    const end = /<\/main>/i.test(html) ? /<\/main>/i : /<\/body>/i;
    html = html.replace(end, privacy + '$&');
  }
  if (html !== original) fs.writeFileSync(file, html);
}
if (!protectedPages) throw new Error('No contact forms found');
console.log('Invisible Turnstile protection:', protectedPages, 'pages');
