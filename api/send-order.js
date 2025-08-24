// /api/send-order.js  (สำหรับ Vercel serverless) — ESM
import nodemailer from "nodemailer";

const ORIGIN = process.env.ALLOW_DEBUG_ORIGIN || "http://localhost:5173";
const USER = process.env.GMAIL_USER;
const PASS = process.env.GMAIL_APP_PASS;

function toAttachments(slip) {
  if (!slip?.base64) return [];
  const [, b64maybe] = String(slip.base64).split(",");
  const b64 = b64maybe || slip.base64; // รองรับทั้ง dataURL และ base64 ล้วน
  return [{
    filename: slip.filename || "slip.png",
    content: Buffer.from(b64, "base64"),
    contentType: slip.mime || "image/png",
    encoding: "base64",
    cid: "slip-1",
  }];
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { name, phone, email, orderId, amount, bank, note, cart, itemsTotal, shipping, grandTotal, slip } = body;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: USER, pass: PASS },
    });

    const attachments = toAttachments(slip);

    const html = `
      <div style="font-family:system-ui,sans-serif">
        <h2>แจ้งโอน ${orderId || "-"}</h2>
        <p><b>ชื่อ:</b> ${name || "-"} | <b>เบอร์:</b> ${phone || "-"}</p>
        <p><b>อีเมล:</b> ${email || "-"}</p>
        <p><b>ยอดโอน:</b> ${amount || "-"} | <b>ธนาคาร:</b> ${bank || "-"}</p>
        ${note ? `<p><b>หมายเหตุ:</b> ${note}</p>` : ""}
        ${Array.isArray(cart) && cart.length ? `
          <hr/><h3>รายการ</h3>
          <ul>${cart.map(x => `<li>${x.title} x${x.qty} = <b>${x.price * x.qty}฿</b></li>`).join("")}</ul>
          <p>ยอดสินค้า: <b>${itemsTotal}฿</b> | ค่าส่ง: <b>${shipping}฿</b> | รวม: <b>${grandTotal}฿</b></p>
        ` : ""}
        ${attachments.length ? `<hr/><p><img src="cid:slip-1" style="max-width:480px;border:1px solid #eee;border-radius:8px"/></p>` : ""}
      </div>
    `;

    const mail = await transporter.sendMail({
      from: `โล๊ะแผ่นมือ 2 <${USER}>`,
      to: USER,
      replyTo: email || undefined,
      subject: `แจ้งโอน ${orderId || "-"} | ${name || ""} ${phone || ""}`,
      text: `ชื่อ: ${name}\nเบอร์: ${phone}\nอีเมล: ${email}\nออเดอร์: ${orderId}\nยอดโอน: ${amount}\nธนาคาร: ${bank}\nหมายเหตุ: ${note || "-"}`,
      html,
      attachments, // ⭐ สำคัญ: แนบสลิป
    });

    res.status(200).json({ ok: true, id: mail.messageId, hasAttachment: !!attachments.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}
