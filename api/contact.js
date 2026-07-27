const SITE = {
  businessName: "Mineral Rights Purchase",
  businessEmail: "closing@mineralrightspurchase.com",
  siteUrl: "https://mineralrightspurchase.com"
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
  const raw = await readBody(req);
  if (clean(req.headers["content-type"]).toLowerCase().includes("application/json")) {
    return raw ? JSON.parse(raw) : {};
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function leadFrom(body, req) {
  const first = clean(body.firstName);
  const last = clean(body.lastName);
  return {
    name: [first, last].filter(Boolean).join(" "),
    email: clean(body.emailAddress),
    phone: clean(body.phoneNumber),
    propertyLocation: clean(body.propertyLocation),
    recordClues: clean(body.fileEvidence || body.recordClues),
    details: clean(body.propertyDetails),
    honeypot: clean(body.website),
    source: clean(req.headers.referer || SITE.siteUrl + "/contact")
  };
}

function invalid(lead) {
  if (!lead.name || !lead.email || !lead.phone || !lead.propertyLocation || !lead.details) {
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

async function sendEmail(to, lead) {
  const apiKey = clean(process.env.SENDGRID_API_KEY);
  if (!apiKey) throw new Error("SENDGRID_API_KEY is missing");
  const from = clean(process.env.SENDGRID_FROM_EMAIL) || SITE.businessEmail;
  const rows = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Mineral location", lead.propertyLocation],
    ["Record clues", lead.recordClues || "Not provided"],
    ["Ownership and transaction facts", lead.details],
    ["Source", lead.source]
  ];
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = rows.map(([label, value]) =>
    `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
  ).join("");
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: { email: from, name: SITE.businessName },
      reply_to: { email: lead.email, name: lead.name },
      personalizations: [{ to: [{ email: to }] }],
      subject: `Mineral file request: ${lead.propertyLocation}`,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html }
      ],
      categories: ["mineral-rights-lead", "mineralrightspurchase-com"]
    })
  });
  if (!response.ok) throw new Error(`SendGrid request failed (${response.status})`);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed." });
  if (!rateLimit(req)) return json(res, 429, { ok: false, error: "Please wait before trying again." });

  try {
    const lead = leadFrom(await payload(req), req);
    const error = invalid(lead);
    if (error) return json(res, 400, { ok: false, error });
    if (!solicitation(lead)) {
      const recipients = clean(
        process.env.CONTACT_NOTIFICATION_RECIPIENTS ||
        process.env.RANKHOUND_NOTIFICATION_EMAIL ||
        SITE.businessEmail
      ).split(/[\n,;]/).map(clean).filter(Boolean);
      await Promise.all([...new Set(recipients)].map((to) => sendEmail(to, lead)));
    }
    return redirect(res, "/contact?submitted=1");
  } catch (error) {
    console.error(error);
    return json(res, 500, { ok: false, error: "We could not submit the mineral file. Please call or email us." });
  }
};
