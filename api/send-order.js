// ESM serverless on Vercel
import nodemailer from "nodemailer";

const ORIGIN = process.env.ALLOW_DEBUG_ORIGIN || "http://localhost:5173";
const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 465);
const SECURE = String(process.env.SMTP_SECURE ?? "1") === "1";
const USER = process.env.SMTP_USER || process.env.GMAIL_USER;
const PASS = process.env.SMTP_PASS || process.env.GMAIL_APP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || `DVD Shop <${USER}>`;
const TO_FALLBACK = process.env.TO_EMAIL || USER;

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const {
      mode, cart = [], itemsTotal = 0, shipping = 0, grandTotal = 0,
      orderId = "", name = "", phone = "", address = "", note = "",
      // >>> สำคัญ: รับได้หลายชื่อ
      toEmail, email, recipient,
    } = body;

    const to = toEmail || email || recipient || TO_FALLBACK;

    const transporter = nodemailer.createTransport({
      host: HOST, port: PORT, secure: SECURE, auth: { user: USER, pass: PASS },
    });

    const subject =
      mode === "order"
        ? `สรุปคำสั่งซื้อของคุณ (${orderId || "ไม่มีเลขออเดอร์"})`
        : `แจ้งโอน/ติดต่อจากลูกค้า`;

    const lines = cart.map(
      (x) => `• ${x.title} x${x.qty} = ${(x.price * x.qty).toLocaleString()}฿`
    ).join("\n");

    const text =
      `ชื่อ: ${name || "-"}\n` +
      `โทร: ${phone || "-"}\n` +
      `อีเมลผู้รับสรุป: ${to}\n` +
      `ที่อยู่: ${address || "-"}\n` +
      `หมายเหตุ: ${note || "-"}\n\n` +
      `สรุปสินค้า:\n${lines || "-"}\n\n` +
      `ยอดสินค้า: ${Number(itemsTotal).toLocaleString()}฿\n` +
      `ค่าส่ง: ${Number(shipping).toLocaleString()}฿\n` +
      `รวม: ${Number(grandTotal).toLocaleString()}฿`;

    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      text,
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
}
