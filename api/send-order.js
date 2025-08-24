// /api/send-order.js  (Vercel serverless, ESM)
import nodemailer from "nodemailer";

/* ===== ENV / CONFIG ===== */
const ORIGIN = process.env.ALLOW_DEBUG_ORIGIN || "http://localhost:5173";

const HOST   = process.env.SMTP_HOST  || "smtp.gmail.com";
const PORT   = Number(process.env.SMTP_PORT || 465);
const SECURE = (() => {
  const v = String(process.env.SMTP_SECURE ?? (PORT === 465 ? "1" : "0")).toLowerCase();
  return v === "1" || v === "true";
})();

const USER     = process.env.SMTP_USER || "";
const PASS     = process.env.SMTP_PASS || "";
const TO_STORE = process.env.TO_EMAIL  || USER;               // ปลายทางร้าน (แจ้งโอน)
const FROM     = process.env.MAIL_FROM || USER;               // ชื่อ/อีเมลผู้ส่ง

/* ===== Utils ===== */
function toAttachments(slip) {
  if (!slip?.base64) return [];
  const [, b64maybe] = String(slip.base64).split(",");
  const b64 = b64maybe || slip.base64;
  return [{
    filename: slip.filename || "slip.png",
    content: Buffer.from(b64, "base64"),
    contentType: slip.mime || "image/png",
    encoding: "base64",
    cid: "slip-1",
  }];
}

function renderCartList(cart = []) {
  if (!Array.isArray(cart) || cart.length === 0) return "<li>-</li>";
  return cart.map(x => {
    const qty = x.qty || 1;
    const amt = (x.price || 0) * qty;
    return `<li>${x.title} ×${qty} — ${amt}฿</li>`;
  }).join("");
}

function renderEmailHTML({
  mode, name, phone, email, address, note, orderId,
  itemsTotal = 0, shipping = 0, grandTotal = 0, amount = 0,
  cart = [], includeSlip = false
}) {
  const title = mode === "order" ? "สรุปรายการสั่งซื้อ" : "แจ้งโอน";
  const total = grandTotal || amount || 0;
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6">
    <h2 style="margin:0 0 8px">${title}</h2>
    <p><b>หมายเลขสั่งซื้อ:</b> ${orderId || "-"}</p>
    <p><b>ชื่อ:</b> ${name || "-"} &nbsp;&nbsp; <b>เบอร์:</b> ${phone || "-"}</p>
    ${email ? `<p><b>อีเมล:</b> ${email}</p>` : ""}
    ${address ? `<p><b>ที่อยู่จัดส่ง:</b> ${address}</p>` : ""}

    <h3 style="margin:16px 0 6px">รายการ</h3>
    <ul style="margin:0;padding-left:18px">${renderCartList(cart)}</ul>

    <p style="margin:10px 0 0;color:#555">
      ยอดสินค้า: <b>${itemsTotal}฿</b> &nbsp;|&nbsp; ค่าส่ง: <b>${shipping}฿</b> &nbsp;|&nbsp;
      รวมทั้งสิ้น: <b>${total}฿</b>
    </p>

    ${note ? `<p style="margin-top:10px"><b>หมายเหตุ:</b> ${note}</p>` : ""}

    ${includeSlip ? `
      <p style="margin-top:12px">
        <img src="cid:slip-1" alt="slip" style="max-width:480px;border:1px solid #eee;border-radius:8px" />
      </p>` : ""
    }
  </div>`;
}

/* ===== Handler ===== */
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const {
      // ฟิลด์ร่วม
      mode,                       // "order" => ส่งหาลูกค้า | อื่นๆ => แจ้งโอนเข้าร้าน
      name, phone, email, address, note,
      orderId, amount, bank,
      cart = [], itemsTotal = 0, shipping = 0, grandTotal = 0,
      slip,                       // สำหรับแจ้งโอน
      toEmail,                    // อีเมลลูกค้า (โหมด order)
    } = body;

    const transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      auth: { user: USER, pass: PASS },
    });

    // === โหมดสั่งซื้อ: ส่งสรุปให้ลูกค้า ===
    if (mode === "order" && toEmail) {
      const html = renderEmailHTML({
        mode: "order",
        name, phone, email, address, note, orderId,
        itemsTotal, shipping, grandTotal, amount,
        cart, includeSlip: false,
      });

      const mail = await transporter.sendMail({
        from: FROM,
        to: toEmail,                   // ลูกค้า
        replyTo: TO_STORE,             // ลูกค้ากดตอบกลับ, เด้งเข้าร้าน
        subject: `สรุปรายการสั่งซื้อ #${orderId || ""}`,
        html,
      });

      return res.status(200).json({ ok: true, mode: "order", id: mail.messageId, sentTo: toEmail });
    }

    // === แจ้งโอน: ส่งเข้าร้าน (แนบสลิปถ้ามี) ===
    const attachments = toAttachments(slip);
    const html = renderEmailHTML({
      mode: "payment",
      name, phone, email, address, note, orderId, bank,
      itemsTotal, shipping, grandTotal, amount,
      cart, includeSlip: attachments.length > 0,
    });

    const mail = await transporter.sendMail({
      from: FROM,
      to: TO_STORE,                    // ร้าน
      replyTo: email || undefined,     // ร้านตอบกลับไปหาลูกค้าได้
      subject: `แจ้งโอน #${orderId || ""}`,
      html,
      attachments,
    });

    return res.status(200).json({ ok: true, mode: "payment", id: mail.messageId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
