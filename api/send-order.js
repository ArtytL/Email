// /api/send-order.js  (Vercel Serverless, ESM)
import nodemailer from "nodemailer";

/* ====== ENV ======
 * ตั้งค่าใน Vercel → Project → Settings → Environment Variables
 *  จำเป็น: SMTP_USER, SMTP_PASS   (ถ้าใช้ Gmail → App Password)
 *  ทางเลือก: SMTP_HOST(ปกติ smtp.gmail.com) / SMTP_PORT(465/587) / SMTP_SECURE(1/0)
 *           SHOP_EMAIL(อีเมลร้านไว้รับออเดอร์) / MAIL_FROM("โล๊ะ DVD <you@gmail.com>")
 *           ALLOW_DEBUG_ORIGIN (เช่น http://localhost:5173)
 */
const ORIGIN =
  process.env.ALLOW_DEBUG_ORIGIN ||
  "http://localhost:5173"; // เปลี่ยนได้ตามสภาพแวดล้อม

const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 465);
const SECURE =
  String(process.env.SMTP_SECURE ?? (PORT === 465 ? "1" : "0")).toLowerCase() ===
  "1";

const USER = process.env.SMTP_USER || process.env.GMAIL_USER; // เผื่อใช้ key เก่า
const PASS = process.env.SMTP_PASS || process.env.GMAIL_APP_PASS;

const SHOP_EMAIL = process.env.SHOP_EMAIL || USER; // กล่องอีเมลร้าน
const MAIL_FROM =
  process.env.MAIL_FROM || `โล๊ะ DVD มือสอง <${USER || "no-reply@example.com"}>`;

/* ---------- utils ---------- */
function safe(x) {
  return (x ?? "").toString().trim();
}

function toAttachments(slip) {
  // รับ slip: { base64: 'data:image/png;base64,AAA...', filename, mime }
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
    return []; // ถ้า base64 เพี้ยน ก็ไม่แนบ
  }
}

function baht(n) {
  if (Number.isFinite(n)) return `${n.toLocaleString("th-TH")}฿`;
  const num = Number(n || 0);
  return `${num.toLocaleString("th-TH")}฿`;
}

function listRows(cart = []) {
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

function orderHtmlAdmin(b) {
  const {
    name,
    phone,
    email,
    orderId,
    cart = [],
    itemsTotal = 0,
    shipping = 0,
    grandTotal = 0,
    note,
    bank,
  } = b || {};
  return `
  <div style="font-family:system-ui,sans-serif;line-height:1.6">
    <h2 style="margin:0 0 8px">มีออเดอร์ใหม่</h2>
    <p style="margin:0 0 12px;color:#555">
      หมายเลขสั่งซื้อ: <b>${safe(orderId) || "-"}</b>
    </p>

    <table border="0" cellpadding="8" cellspacing="0" style="width:100%;border:1px solid #eee;border-collapse:collapse">
      <thead>
        <tr style="background:#fafafa">
          <th align="left">รายการ</th>
          <th align="center" width="80">จำนวน</th>
          <th align="right" width="120">ราคา</th>
        </tr>
      </thead>
      <tbody>${listRows(cart)}</tbody>
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
    ${
      note
        ? `<p style="margin:8px 0 0">หมายเหตุ: ${safe(note)}</p>`
        : ""
    }
    <p style="margin:16px 0 0;color:#777">* แนบสลิปไว้ในไฟล์แนบ</p>
  </div>`;
}

function orderHtmlCustomer(b) {
  const { name, orderId, grandTotal, shipping } = b || {};
  return `
  <div style="font-family:system-ui,sans-serif;line-height:1.6">
    <h2 style="margin:0 0 8px">ยืนยันคำสั่งซื้อของคุณ</h2>
    <p>หมายเลขสั่งซื้อ: <b>${safe(orderId) || "-"}</b></p>
    <p>ชื่อผู้สั่งซื้อ: ${safe(name) || "-"}</p>
    <p>ยอดรวมทั้งสิ้น: <b>${baht(grandTotal)}</b> (รวมค่าส่ง ${baht(
    shipping
  )})</p>
    <p>หากต้องการแก้ไขข้อมูล/สอบถามเพิ่มเติม สามารถตอบกลับอีเมลฉบับนี้ได้ทันทีครับ</p>
  </div>`;
}

/* ---------- handler ---------- */
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // parse body
  let body = {};
  try {
    body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};
  } catch (err) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  // สร้าง transporter
  if (!USER || !PASS) {
    return res.status(500).json({
      error:
        "SMTP credentials are missing. Please set SMTP_USER and SMTP_PASS.",
    });
  }

  const transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: SECURE, // true=465 / false=587
    auth: { user: USER, pass: PASS },
  });

  // เตรียมข้อมูลอีเมล
  const attachments = toAttachments(body.slip);
  const buyerEmail = safe(body.email).toLowerCase();
  const buyerName = safe(body.name);
  const buyerPhone = safe(body.phone);
  const orderId = safe(body.orderId);

  // 1) ส่งให้ "ร้าน/แอดมิน"
  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to: SHOP_EMAIL,
      replyTo: buyerEmail || undefined, // กด Reply แล้วเด้งหาลูกค้า
      subject: `มีออเดอร์ใหม่ – ${buyerName} ${buyerPhone} | ${orderId}`,
      html: orderHtmlAdmin(body),
      attachments, // แนบสลิปถ้ามี
    });
  } catch (err) {
    console.error("send to admin failed:", err);
    return res
      .status(500)
      .json({ error: "ส่งหาแอดมินไม่สำเร็จ", detail: String(err?.message) });
  }

  // 2) ส่งให้ "ลูกค้า" (ถ้ากรอกอีเมล)
  if (buyerEmail) {
    try {
      await transporter.sendMail({
        from: MAIL_FROM,
        to: buyerEmail,
        replyTo: SHOP_EMAIL, // ลูกค้าตอบกลับเข้าร้าน
        subject: `ยืนยันคำสั่งซื้อของคุณ – ${orderId}`,
        html: orderHtmlCustomer(body),
      });
    } catch (err) {
      console.error("send to customer failed:", err);
      // ไม่ fail ทั้ง API — แจ้งเตือนเฉย ๆ
    }
  }

  return res.status(200).json({
    ok: true,
    orderId,
    hasAttachment: !!attachments.length,
  });
}
