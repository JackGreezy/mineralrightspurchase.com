const SITE = {
  businessName: "Mineral Rights Purchase",
  businessEmail: "closing@mineralrightspurchase.com",
  siteUrl: "https://mineralrightspurchase.com"
};

const BRAND = {
  "templateId": "d-c6cff7760ef649a98495492b3dfc4453",
  "domain": "mineralrightspurchase.com",
  "category": "mineralrightspurchase-com",
  "phone": "405-709-5947",
  "logo_url": "https://mineralrightspurchase.com/brand/logo.png",
  "brand_accent": "#334b5e",
  "accent_text": "#ffffff",
  "header_bg": "#ffffff",
  "cta_dark_bg": "#263746",
  "bg_color": "#eef1f4",
  "text_dark": "#172b3a",
  "text_muted": "#64727f",
  "text_body": "#3a4654",
  "text_faint": "#8896a1",
  "border_color": "#e3e8ed",
  "card_header_bg": "#f6f8f9",
  "heading_font_family": "'Montserrat',Helvetica,Arial,sans-serif",
  "body_font_family": "'Montserrat',Helvetica,Arial,sans-serif",
  "font_import": "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap"
};

const WINDOW_MS = 60 * 1000;
const REQUEST_LIMIT = 6;
const buckets = new Map();
const clean = (value) => String(value || "").trim();
const escapeHtml = (value) => clean(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.statusCode = 303;
  res.setHeader("Location", location);
  res.end();
}

function rateLimit(req) {
  const key = clean(req.headers["cf-connecting-ip"]) ||
    clean(String(req.headers["x-forwarded-for"] || "").split(",")[0]) ||
    clean(req.headers["x-real-ip"]) ||
    "unknown";
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, reset: now + WINDOW_MS };
  if (bucket.reset <= now) {
    bucket.count = 0;
    bucket.reset = now + WINDOW_MS;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count <= REQUEST_LIMIT;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) reject(new Error("Request body too large"));
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function payload(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    return clean(req.headers["content-type"]).toLowerCase().includes("application/json")
      ? JSON.parse(req.body)
      : Object.fromEntries(new URLSearchParams(req.body).entries());
  }
  const raw = await readBody(req);
  if (clean(req.headers["content-type"]).toLowerCase().includes("application/json")) {
    return raw ? JSON.parse(raw) : {};
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function first(body, keys) {
  for (const key of keys) {
    const value = clean(body[key]);
    if (value) return value;
  }
  return "";
}

function leadFrom(body, req) {
  const legacyName = [clean(body.firstName), clean(body.lastName)].filter(Boolean).join(" ");
  return {
    name: first(body, ["name", "contact_name", "owner_name"]) || legacyName,
    email: first(body, ["email", "emailAddress"]),
    phone: first(body, ["phone", "phoneNumber"]),
    message: first(body, [
      "message",
      "propertyDetails",
      "property_details",
      "property_question",
      "property_checkpoint",
      "valuationQuestion",
      "review_context"
    ]),
    honeypot: first(body, ["website", "url"]),
    source: clean(req.headers.referer || SITE.siteUrl + "/contact")
  };
}

function invalid(lead) {
  if (!lead.name || !lead.email || !lead.phone || !lead.message) {
    return "Please complete each required field.";
  }
  if (!/^\S+@\S+\.\S+$/.test(lead.email)) return "Please enter a valid email address.";
  if (lead.phone.replace(/\D/g, "").length < 7) return "Please enter a valid phone number.";
  return "";
}

function solicitation(lead) {
  const text = Object.values(lead).join(" ").toLowerCase();
  const pitches = [
    "guest post",
    "link building",
    "backlinks",
    "domain authority",
    "seo services",
    "web design services",
    "first page of google",
    "marketing agency",
    "crypto investment"
  ];
  return Boolean(lead.honeypot) ||
    pitches.some((term) => text.includes(term)) ||
    (text.match(/https?:\/\//g) || []).length > 2;
}

async function sendEmail(to, lead, notificationType = "internal_notification") {
  const apiKey = clean(process.env.SENDGRID_API_KEY);
  if (!apiKey) throw new Error("SENDGRID_API_KEY is missing");
  const from = clean(process.env.SENDGRID_FROM_EMAIL) || SITE.businessEmail;
  const customer = notificationType === "customer_confirmation";
  const subject = customer
    ? `Thank you for your Mineral Rights inquiry | ${SITE.businessName}`
    : `${SITE.businessName}: New Mineral Rights inquiry from ${lead.name}`;
  const templateId = clean(process.env.SENDGRID_TEMPLATE_ID) || BRAND.templateId;
  if (!templateId) throw new Error("SENDGRID_TEMPLATE_ID is missing");
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: { email: from, name: SITE.businessName },
      reply_to: customer
        ? { email: SITE.businessEmail, name: SITE.businessName }
        : { email: lead.email, name: lead.name },
      template_id: templateId,
      personalizations: [{
        to: [{ email: to }],
        dynamic_template_data: {
          ...BRAND,
          logo_url: clean(process.env.SENDGRID_LOGO_URL) || BRAND.logo_url,
          subject,
          company_name: SITE.businessName,
          city_state: "",
          address_line: "",
          preheader: customer ? "Your mineral rights inquiry has been received." : `New inquiry from ${lead.name}.`,
          hero_title: customer ? `Thank you, ${lead.name}.` : "New Mineral Rights Inquiry",
          hero_subtitle: customer
            ? `${SITE.businessName} has received your inquiry. Our team will review your message and follow up.`
            : `A new inquiry was submitted to ${SITE.businessName}.`,
          details_title: customer ? "Your inquiry details" : "Contact and inquiry details",
          lead: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            phone_plain: lead.phone.replace(/\D/g, ""),
            projectDescription: lead.message
          },
          submitted_date: new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "long", day: "numeric" }),
          call_phone: BRAND.phone,
          call_phone_plain: BRAND.phone.replace(/\D/g, ""),
          call_cta_label: "Call Our Team",
          site_cta_label: "Visit Our Website",
          site_url: SITE.siteUrl,
          footer_note: customer
            ? `This confirmation relates to the inquiry you submitted to ${SITE.businessName}.`
            : `Submitted through ${SITE.siteUrl}/contact.`,
          notification_type: notificationType
        }
      }],
      categories: ["mineral-rights-lead", BRAND.category, notificationType],
      custom_args: { site_host: BRAND.domain, notification_type: notificationType }
    })
  });
  if (!response.ok) throw new Error(`SendGrid request failed (${response.status})`);
}

async function verifyContactTurnstile(body) {
  const secret = clean(process.env.TURNSTILE_SECRET_KEY);
  if (!secret) return { status: 503, error: 'Verification is temporarily unavailable. Please call or email the team.' };
  const token = body['cf-turnstile-response'];
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    return { status: 400, error: 'Please complete verification and try again.' };
  }
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ secret, response: token })
    });
    if (!response.ok) throw new Error('Verification service unavailable');
    const result = await response.json();
    const hostname = new URL(SITE.siteUrl).hostname.toLowerCase();
    const allowed = [hostname, 'www.' + hostname.replace(/^www\./, '')];
    if (result.success !== true || result.action !== 'contact' || !allowed.includes(String(result.hostname || '').toLowerCase())) {
      return { status: 403, error: 'Verification expired or was unsuccessful. Please try again.' };
    }
    return null;
  } catch {
    return { status: 503, error: 'Verification is temporarily unavailable. Please retry or contact the team by phone or email.' };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed." });
  if (!rateLimit(req)) return json(res, 429, { ok: false, error: "Please wait before trying again." });
  try {
    const body = await payload(req);
    const verification = await verifyContactTurnstile(body);
    if (verification) return json(res, verification.status, { ok: false, error: verification.error });
    const lead = leadFrom(body, req);
    const error = invalid(lead);
    if (error) return json(res, 400, { ok: false, error });
    if (!solicitation(lead)) {
      const recipients = clean(
        process.env.CONTACT_NOTIFICATION_RECIPIENTS ||
        process.env.RANKHOUND_NOTIFICATION_EMAIL ||
        SITE.businessEmail
      ).split(/[\n,;]/).map(clean).filter(Boolean);
      await Promise.all([...new Set(recipients)].map((to) => sendEmail(to, lead)));
      await sendEmail(lead.email, lead, "customer_confirmation");
    }
    if (clean(req.headers.accept).includes("application/json")) return json(res, 200, { ok: true });
    return redirect(res, "/contact?submitted=1");
  } catch (error) {
    console.error(error);
    return json(res, 500, { ok: false, error: "The form could not be submitted. Please call or email the team." });
  }
};
