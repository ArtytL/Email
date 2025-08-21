// api/send-order.js (ESM)
import nodemailer from "nodemailer";

function withCORS(res) {
  const origin = process.env.ALLOW_DEBUG_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

async function readJSON(req) {
  try {
    if (req.body && typeof req.body === "object") return req.body;
    if (typeof req.body === "string") return JSON.parse(req.body);
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch (e) { console.error("Body parse failed:", e); return {}; }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return withCORS(res).status(200).end();
  if (req.method !== "POST") return withCORS(res).status(405).json({ ok:false, error:"Method Not Allowed" });

  const { orderId, items = [], total = 0, customer = {}, bank = "", slipDataURL = "" } = await readJSON(req);

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: !!Number(process.env.SMTP_SECURE || 0),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const attachments = [];
    if (slipDataURL && slipDataURL.includes(",")) {
      const b64 = slipDataURL.split(",")[1] || "";
      if (b64) attachments.push({ filename: `slip-${orderId||"noid"}.png`, content: Buffer.from(b64,"base64") });
    }

    const itemsHtml = items.map(it => `<li>${it.title||it.name||"รายการ"} × ${it.qty||1} — ฿${Number(it.price||0).toLocaleString("th-TH")}</li>`).join("");
    const html = `<h3>ออร์เดอร์ใหม่ #${orderId||"-"}</h3>
      <p>ลูกค้า: ${customer.name||"-"} (${customer.phone||"-"}) — ${customer.email||"-"}</p>
      <p>ธนาคาร: ${bank||"-"}</p><ul>${itemsHtml}</ul>
      <p><b>รวมทั้งหมด:</b> ฿${Number(total||0).toLocaleString("th-TH")}</p>`;

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.TO_EMAIL,
      replyTo: customer.email || undefined,
      subject: `โล๊ะเเผ่นมือ 2 ออร์เดอร์ใหม่ ${orderId||""} (฿${total||0})`,
      html,
      attachments,
    });

    return withCORS(res).status(200).json({ ok:true, messageId: info.messageId });
  } catch (e) {
    console.error("send-order error:", e);
    return withCORS(res).status(500).json({ ok:false, error: String(e?.message||e) });
  }
}
