// api/send-order.js  (Vercel serverless, ESM)
import nodemailer from "nodemailer";

/* ========= ENV =========
 * SMTP_HOST        (เช่น smtp.gmail.com)
 * SMTP_PORT        (465 สำหรับ SSL หรือ 587 สำหรับ STARTTLS)
 * SMTP_SECURE      ("1"=true, "0"=false)
 * SMTP_USER        (อีเมลผู้ส่ง / Gmail)
 * SMTP_PASS        (App Password ของ Gmail หรือรหัส SMTP)
 * SHOP_EMAIL       (อีเมลร้านที่รับออเดอร์)
 * MAIL_FROM        (เช่น "โล๊ะ DVD มือสอง <you@gmail.com>")
 * ALLOW_DEBUG_ORIGIN (เช่น http://localhost:5173 เพื่อ CORS ตอน dev)
 */
const ORIGIN_FROM_ENV = (process.env.ALLOW_DEBUG_ORIGIN || "").trim();

const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 465);
const SECURE =
  String(process.env.SMTP_SECURE ?? (PORT === 465 ? "1" : "0")).toLowerCase() ===
  "1";

const USER = process.env.SMTP_USER || process.env.GMAIL_USER;
const PASS = process.env.SMTP_PASS || process.env.GMAIL_APP_PASS;

const SHOP_EMAIL = process.env.SHOP_EMAIL || USER;
const MAIL_FROM =
  process.env.MAIL_FROM || `โล๊ะ DVD มือสอง <${USER || "no-reply@example.com"}>`;

/* ========= utils ========= */
const safe = (x) => (x ?? "").toString().trim();

function toAttachments(slip) {
  // รองรับทั้ง dataURL และ base64 ล้วน
  if (!slip || !slip.base64) return [];
  const raw = safe(slip.base64);
  const isDataUrl = raw.startsWith("data:");
  const b64 = isDataUrl ? raw.split(",")[1] : raw;
  const mime =
    safe(slip.mime) ||
    (isDataUrl ? raw.slice(5, raw.indexOf(";")) : "image/png");
  const filename = safe(slip.filename) || "slip.png";

  try {
    return [
      {
        filename,
        content: Buffer.from(b64, "base64"),
        contentType: mime,
        encoding: "base64",
      },
    ];
  } catch {
    return [];
  }
}

const baht = (n) => `${Number(n || 0).toLocaleString("th-TH")}฿`;

function rows(cart = []) {
  return (cart || [])
    .map(
      (it) => `
      <tr>
        <td>${safe(it.title || it.name)}</td>
        <td style="text-align:center">${safe(it.qty) || 1}</td>
        <td style="text-align:right">${baht(it.price)}</td>
      </tr>`
    )
    .join("");
}

function htmlAdmin(b) {
  const {
    name,
    phone,
    email,
    orderId,
    cart = [],
    itemsTotal = 0,
    shipping = 0,
    grandTotal = 0,
    bank,
    note,
  } = b || {};
  return `
  <div style="font-family:system-ui,sans-serif;line-height:1.6">
    <h2 style="margin:0 0 8px">มีออเดอร์ใหม่</h2>
    <p style="margin:0 0 12px">หมายเลขสั่งซื้อ: <b>${safe(orderId) || "-"}</b></p>

    <table border="0" cellpadding="8" cellspacing="0" style="width:100%;border:1px solid #eee;border-collapse:collapse">
      <thead>
        <tr style="background:#fafafa">
          <th align="left">รายการ</th>
          <th width="80" align="center">จำนวน</th>
          <th width="120" align="right">ราคา</th>
        </tr>
      </thead>
      <tbody>${rows(cart)}</tbody>
      <tfoot>
        <tr><td colspan="2" align="right" style="border-top:1px solid #eee">ยอดสินค้า</td><td align="right" style="border-top:1px solid #eee">${baht(itemsTotal)}</td></tr>
        <tr><td colspan="2" align="right">ค่าส่ง</td><td align="right">${baht(shipping)}</td></tr>
        <tr><td colspan="2" align="right"><b>รวมทั้งสิ้น</b></td><td align="right"><b>${baht(grandTotal)}</b></td></tr>
      </tfoot>
    </table>

    <h3 style="margin:16px 0 6px">ข้อมูลผู้สั่งซื้อ</h3>
    <p style="margin:0">ชื่อ: ${safe(name) || "-"}</p>
    <p style="margin:0">เบอร์: ${safe(phone) || "-"}</p>
    <p style="margin:0">อีเมล: ${safe(email) || "-"}</p>
    <p style="margin:0">ธนาคาร: ${safe(bank) || "-"}</p>
    ${note ? `<p style="margin:8px 0 0">หมายเหตุ: ${safe(note)}</p>` : ""}
    <p style="margin:16px 0 0;color:#777">* ไฟล์แนบ: สลิปโอน (ถ้ามี)</p>
  </div>`;
}

function htmlCustomer(b) {
  const { name, orderId, grandTotal, shipping } = b || {};
  return `
  <div style="font-family:system-ui,sans-serif;line-height:1.6">
    <h2 style="margin:0 0 8px">ยืนยันคำสั่งซื้อของคุณ</h2>
    <p>หมายเลขสั่งซื้อ: <b>${safe(orderId) || "-"}</b></p>
    <p>ชื่อผู้สั่งซื้อ: ${safe(name) || "-"}</p>
    <p>ยอดรวมทั้งสิ้น: <b>${baht(grandTotal)}</b> (รวมค่าส่ง ${baht(shipping)})</p>
    <p>ขอบคุณที่อุดหนุนครับ หากมีข้อสงสัยสามารถตอบกลับอีเมลฉบับนี้ได้ทันที</p>
  </div>`;
}

/* ========= handler ========= */
export default async function handler(req, res) {
  // CORS
  const reqOrigin = req.headers.origin || "*";
  const allowOrigin = ORIGIN_FROM_ENV || reqOrigin || "*";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // parse body
  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  // validate SMTP
  if (!USER || !PASS) {
    return res.status(500).json({ error: "Missing SMTP_USER / SMTP_PASS" });
  }

  // create transporter
  const transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: SECURE, // true=465 / false=587
    auth: { user: USER, pass: PASS },
  });

  // prepare data
  const attachments = toAttachments(body.slip);
  const buyerEmail = safe(body.email).toLowerCase();
  const buyerName = safe(body.name);
  const buyerPhone = safe(body.phone);
  const orderId = safe(body.orderId);

  // 1) send to shop/admin
  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to: SHOP_EMAIL,
      replyTo: buyerEmail || undefined,     // กดตอบกลับแล้วหาลูกค้า
      subject: `ออเดอร์ใหม่ – ${buyerName} ${buyerPhone} | ${orderId}`,
      html: htmlAdmin(body),
      attachments,                          // แนบสลิปถ้ามี
    });
  } catch (err) {
    console.error("send-to-admin failed:", err);
    return res.status(500).json({ error: "ส่งหาแอดมินไม่สำเร็จ", detail: String(err?.message) });
  }

  // 2) send confirmation to customer (if has email)
  if (buyerEmail) {
    try {
      await transporter.sendMail({
        from: MAIL_FROM,
        to: buyerEmail,
        replyTo: SHOP_EMAIL,                 // ลูกค้าตอบกลับมาที่ร้าน
        subject: `ยืนยันคำสั่งซื้อ – ${orderId}`,
        html: htmlCustomer(body),
      });
    } catch (err) {
      // ไม่ fail งานหลัก — log ไว้เฉยๆ
      console.error("send-to-customer failed:", err);
    }
  }

  return res.status(200).json({
    ok: true,
    orderId,
    hasAttachment: !!attachments.length,
  });
}
