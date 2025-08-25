// /api/send-order.js  (Vercel serverless, ESM)
import nodemailer from "nodemailer";

const ORIGIN = process.env.ALLOW_DEBUG_ORIGIN || "http://localhost:5173";

const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 465);
const SECURE = String(
  process.env.SMTP_SECURE ?? (PORT === 465 ? "1" : "0")
) === "1";

const USER = process.env.SMTP_USER;      // e.g. artyt.sun@gmail.com
const PASS = process.env.SMTP_PASS;      // Gmail App Password
const SHOP = process.env.SHOP_EMAIL || USER;  // admin inbox
const FROM = process.env.MAIL_FROM || `DVD Shop <${USER}>`;

function toAttachments(slip) {
  if (!slip?.base64) return [];
  const [, b64] = String(slip.base64).split(",");
  return [
    {
      filename: slip.filename || "slip.png",
      content: Buffer.from(b64, "base64"),
      contentType: slip.mime || "image/png",
      encoding: "base64",
      cid: "slip-1",
    },
  ];
}

function orderHtml(b) {
  const {
    orderId,
    name,
    phone,
    email,
    cart = [],
    itemsTotal = 0,
    shipping = 0,
    grandTotal = 0,
    bank,
    note,
  } = b || {};

  const list = cart
    .map(
      (x) =>
        `<li>${x.title} ×${x.qty} <b>${x.price * x.qty}฿</b></li>`
    )
    .join("");

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
    <h2>ออเดอร์ใหม่ ${orderId || "-"}</h2>
    <p><b>ชื่อ:</b> ${name || "-"} <b>โทร:</b> ${phone || "-"}</p>
    <p><b>อีเมล:</b> ${email || "-"}</p>
    <h3>รายการ</h3>
    <ul>${list}</ul>
    <p>ยอดสินค้า: <b>${itemsTotal}฿</b> | ค่าส่ง: <b>${shipping}฿</b> | รวม: <b>${grandTotal}฿</b></p>
    ${bank ? `<p><b>โอนเข้าธนาคาร:</b> ${bank}</p>` : ""}
    ${note ? `<p><b>หมายเหตุ:</b> ${note}</p>` : ""}
    ${b.slip?.base64 ? `<p><img src="cid:slip-1" style="max-width:420px;border:1px solid #eee"/></p>` : ""}
  </div>`;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { name, email } = body;

    const transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      auth: { user: USER, pass: PASS },
    });

    // ตรวจเชื่อมต่อ SMTP ให้รู้สาเหตุทันที
    await transporter.verify().catch((e) => {
      console.error("SMTP verify failed:", e);
      throw new Error("SMTP verification failed: " + e.message);
    });

    const attachments = toAttachments(body.slip);
    const html = orderHtml(body);

    // ส่งเข้าร้าน (แอดมิน)
await transporter.sendMail({
  from: FROM,                 // ต้องเป็นอีเมลเดียวกับ SMTP_USER
  to: SHOP,                   // ร้าน/แอดมิน (SHOP_EMAIL/TO_EMAIL/หรือ FROM)
  replyTo: email || FROM,     // กด Reply แล้วเด้งหาลูกค้า
  subject: `ออเดอร์ใหม่ | ${body.orderId || "-"}`,
  html,                       // ใช้ HTML สรุปออเดอร์ที่คุณประกอบไว้ด้านบน
  attachments,
});

// ส่งสำเนาให้ลูกค้า (ถ้าใส่อีเมล)
if (email) {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `ยืนยันคำสั่งซื้อของคุณ | ${body.orderId || "-"}`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
        <p>ขอบคุณ ${name || ""} สำหรับการสั่งซื้อ 🙏</p>
        ${html}
      </div>
    `,
    attachments,
  });
}

    return res.status(200).json({
      ok: true,
      id: adminMail.messageId,
      hasAttachment: !!attachments.length,
    });
  } catch (err) {
    console.error("send-order error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
      code: err.code,
      hint:
        "เช็ค SMTP_* env, App Password ของ Gmail, ALLOW_DEBUG_ORIGIN, และค่า SHOP_EMAIL/MAIL_FROM ให้ครบ",
    });
  }
}
