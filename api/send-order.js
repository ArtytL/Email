// /api/send-order.js — Vercel serverless (ESM)
import nodemailer from "nodemailer";

const ORIGIN = process.env.ALLOW_DEBUG_ORIGIN || "http://localhost:5173";
const HOST   = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT   = Number(process.env.SMTP_PORT || 465);
const SECURE = (() => {
  const v = String(process.env.SMTP_SECURE ?? (PORT === 465 ? "1" : "0")).toLowerCase();
  return v === "1" || v === "true" || v === "yes";
})();
const USER   = process.env.SMTP_USER || process.env.GMAIL_USER;
const PASS   = process.env.SMTP_PASS || process.env.GMAIL_APP_PASS;
const TO     = process.env.TO_EMAIL || USER;
const FROM   = process.env.MAIL_FROM || USER;

function makeAttachment(slip) {
  if (!slip?.base64) return null;
  const raw = String(slip.base64);
  const b64 = raw.includes(",") ? raw.split(",")[1] : raw;
  return {
    filename: slip.filename || "slip.png",
    content: Buffer.from(b64, "base64"),
    contentType: slip.mime || "image/png",
    encoding: "base64",
    contentDisposition: "attachment", // <-- แนบเป็นไฟล์จริงๆ
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")  return res.status(405).json({ error: "Method Not Allowed" });

  if (!USER || !PASS) return res.status(500).json({ error: "MAIL_CREDENTIALS_MISSING" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { name, phone, email, orderId, amount, bank, note,
            cart, itemsTotal, shipping, grandTotal, slip } = body;

    const att = makeAttachment(slip);

    // log ช่วยดีบัก
    console.log("slip?", !!slip, "len", slip?.base64?.length, "mime", slip?.mime, "hasAtt", !!att);

    const transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,            // true -> 465
      auth: { user: USER, pass: PASS },
      connectionTimeout: 10000,  // 10s
      socketTimeout: 20000,      // 20s
      requireTLS: !SECURE,       // ถ้าใช้ 587 จะบังคับ STARTTLS
      tls: { servername: HOST },
    });

    const subject = `แจ้งโอน ${orderId || "-"} | ${name || ""} ${phone || ""}`;
    const text = [
      `ชื่อ: ${name || "-"}`,
      `เบอร์: ${phone || "-"}`,
      `อีเมล: ${email || "-"}`,
      `ออเดอร์: ${orderId || "-"}`,
      `ยอดโอน: ${amount || "-"}`,
      `ธนาคาร: ${bank || "-"}`,
      `หมายเหตุ: ${note || "-"}`,
      "",
      cart?.length ? `รายการ (${cart.length}):` : "",
      ...(cart || []).map(x => `• ${x.title} x${x.qty} = ${x.price * x.qty}฿`),
      cart?.length ? `ยอดสินค้า: ${itemsTotal}฿ | ค่าส่ง: ${shipping}฿ | รวม: ${grandTotal}฿` : "",
    ].filter(Boolean).join("\n");

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
      </div>
    `;

    const mail = await transporter.sendMail({
      from: FROM,
      to: TO,
      replyTo: email || undefined,
      subject,
      text,
      html,
      attachments: att ? [att] : [],
    });

    console.log("sent id", mail.messageId);
    res.status(200).json({ ok: true, id: mail.messageId, attachmentCount: att ? 1 : 0 });
  } catch (err) {
    console.error("send-order error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}
