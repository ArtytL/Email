// /api/send-order.js  (ESM)
import nodemailer from "nodemailer";

const ORIGIN_ALLOW = process.env.ALLOW_DEBUG_ORIGIN || "http://localhost:5173";
const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 465);
const SECURE = String(process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || PORT === 465;
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;

const SHOP_EMAIL = process.env.TO_EMAIL || USER;
const MAIL_FROM = process.env.MAIL_FROM || `DVD Shop <${USER}>`;

// ---------- CORS ----------
function setCORS(req, res) {
  const origin = req.headers.origin || "";
  const allow =
    origin.startsWith("http://localhost") ||
    origin.startsWith("https://localhost") ||
    origin === ORIGIN_ALLOW ||
    origin.endsWith(".vercel.app");

  res.setHeader("Access-Control-Allow-Origin", allow ? origin : ORIGIN_ALLOW);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---------- HTML Builder ----------
function orderHtml(payload) {
  const {
    orderId = "",
    cart = [],
    itemsTotal = 0,
    shipping = 0,
    grandTotal = 0,
    buyer = {},
  } = payload;

  const rows = cart
    .map(
      (x) =>
        `<tr><td>${x.title}</td><td align="right">${x.qty || 1}</td><td align="right">${(
          (x.price || 0) * (x.qty || 1)
        ).toLocaleString()}฿</td></tr>`
    )
    .join("");

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.6">
    <h2>สรุปคำสั่งซื้อ #${orderId}</h2>
    <table width="100%" cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #eee">
      <thead>
        <tr style="background:#fafafa"><th align="left">รายการ</th><th align="right">จำนวน</th><th align="right">ราคา</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="2"><b>ยอดสินค้า</b></td><td align="right">${itemsTotal.toLocaleString()}฿</td></tr>
        <tr><td colspan="2"><b>ค่าส่ง</b></td><td align="right">${shipping.toLocaleString()}฿</td></tr>
        <tr><td colspan="2"><b>รวมทั้งสิ้น</b></td><td align="right"><b>${grandTotal.toLocaleString()}฿</b></td></tr>
      </tfoot>
    </table>

    <h3 style="margin-top:16px">ข้อมูลผู้สั่งซื้อ</h3>
    <div>ชื่อ: ${buyer.name || "-"}</div>
    <div>โทร: ${buyer.phone || "-"}</div>
    <div>อีเมล: ${buyer.email || "-"}</div>
    <div>ที่อยู่: ${buyer.address || "-"}</div>
    <div>หมายเหตุ: ${buyer.note || "-"}</div>
  </div>`;
}

export default async function handler(req, res) {
  setCORS(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Bad JSON body" });
  }

  const transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: SECURE,
    auth: { user: USER, pass: PASS },
  });

  try {
    const { mode } = body;

    if (mode === "order") {
      // ส่งสรุปให้ "ลูกค้า"
      const buyerEmail = body.toEmail || body.email || body.recipient;
      if (!buyerEmail) throw new Error("Missing buyer email");

      const html = orderHtml(body);
      const USER = process.env.SMTP_USER || process.env.GMAIL_USER;
const FROM = process.env.MAIL_FROM || `DVD Shop <${USER}>`;
const TO_ADMIN = process.env.TO_EMAIL || USER; // กล่องแอดมิน
const TO_CUSTOMER = (email || "").trim().toLowerCase();

// ----- สร้าง HTML/ข้อความ 2 เวอร์ชัน -----
const adminSubject   = `มีออเดอร์ใหม่ – ${name || ""} ${phone || ""} | ${orderId || ""}`;
const customerSubject = `ยืนยันคำสั่งซื้อของคุณ – ${orderId || ""}`;

// htmlForAdmin / textForAdmin: ใช้รายละเอียดครบ ๆ + แนบสลิปถ้ามี
const htmlForAdmin = html;              // ถ้ามีตัวแปร html เดิมอยู่แล้ว เอามาใช้ได้เลย
const textForAdmin = `ชื่อ: ${name}\nเบอร์: ${phone}\nอีเมล: ${email}\nหมายเลขสั่งซื้อ: ${orderId}\nยอดรวม: ${grandTotal}฿`;

// htmlForCustomer / textForCustomer: เวอร์ชันลูกค้า (ไม่ต้องแนบสลิป)
const htmlForCustomer = `
  <div style="font-family:system-ui,sans-serif">
    <h2>ยืนยันคำสั่งซื้อของคุณ</h2>
    <p>หมายเลขสั่งซื้อ: <b>${orderId || "-"}</b></p>
    <p>ชื่อ: ${name || "-"}</p>
    <p>ยอดรวมทั้งสิ้น: <b>${grandTotal}฿</b> (รวมค่าส่ง: ${shipping}฿)</p>
    <p>หากต้องการแก้ไขข้อมูลหรือติดตามสถานะ ให้ตอบกลับอีเมลฉบับนี้ได้เลยครับ</p>
  </div>
`;
const textForCustomer = `ยืนยันคำสั่งซื้อ\nหมายเลขสั่งซื้อ: ${orderId}\nยอดรวม: ${grandTotal}฿`;

// ----- ส่งให้ "แอดมิน" -----
await transporter.sendMail({
  from: FROM,
  to: TO_ADMIN,
  replyTo: TO_CUSTOMER || undefined,          // กด Reply แล้วเด้งหาลูกค้า
  subject: adminSubject,
  text: textForAdmin,
  html: htmlForAdmin,
  attachments,                                // แนบสลิปถ้ามี
});

// ----- ส่งให้ "ลูกค้า" -----
if (TO_CUSTOMER) {
  await transporter.sendMail({
    from: FROM,
    to: TO_CUSTOMER,
    replyTo: TO_ADMIN,                         // ลูกค้ากด Reply เด้งหาแอดมิน
    subject: customerSubject,
    text: textForCustomer,
    html: htmlForCustomer,
    // ไม่จำเป็นต้องแนบสลิปสำหรับลูกค้า
  });
}

      return res.status(200).json({ ok: true, id: mail.messageId, to: buyerEmail });
    }

    if (mode === "notify") {
      // ส่งเข้า “ร้าน” (ใช้สำหรับฟอร์มแจ้งโอน/หลังบ้าน)
      const html = orderHtml(body);
      const mail = await transporter.sendMail({
        from: MAIL_FROM,
        to: SHOP_EMAIL,
        replyTo: body.email || undefined,
        subject: `แจ้งโอน/ออเดอร์ใหม่ #${body.orderId || ""}`,
        html,
      });
      return res.status(200).json({ ok: true, id: mail.messageId, to: SHOP_EMAIL });
    }

    // default → ส่งเข้าร้าน
    const mail = await transporter.sendMail({
      from: MAIL_FROM,
      to: SHOP_EMAIL,
      subject: "ข้อความจากหน้าเว็บ",
      html: orderHtml(body),
    });
    return res.status(200).json({ ok: true, id: mail.messageId, to: SHOP_EMAIL });
  } catch (err) {
    console.error("send-order error:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
