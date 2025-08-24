// /api/send-order.js — Vercel serverless (ESM, single-file)
// แนบสลิปเป็นไฟล์, รองรับ ENV ทั้ง SMTP_* และ GMAIL_*, มี verify + fallback 465/587
import nodemailer from "nodemailer";

// ----- ENV -----
const ORIGIN = process.env.ALLOW_DEBUG_ORIGIN || "http://localhost:5173";
const HOST   = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT   = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined; // ถ้าไม่ได้เซ็ต ปล่อยว่าง
const SECURE = (() => {
  if (process.env.SMTP_SECURE == null) return PORT === 465; // เดาอัตโนมัติ
  const v = String(process.env.SMTP_SECURE).toLowerCase();
  return v === "1" || v === "true" || v === "yes";
})();
const USER   = process.env.SMTP_USER || process.env.GMAIL_USER;
const PASS   = process.env.SMTP_PASS || process.env.GMAIL_APP_PASS;
const TO     = process.env.TO_EMAIL || USER;          // กล่องปลายทาง
const FROM   = process.env.MAIL_FROM || USER;         // เช่น "DVD Shop <you@gmail.com>"

// ----- helpers -----
function makeAttachment(slip) {
  if (!slip?.base64) return null;
  const raw = String(slip.base64);
  const b64 = raw.includes(",") ? raw.split(",")[1] : raw;
  return {
    filename: slip.filename || "slip.png",
    content: Buffer.from(b64, "base64"),
    contentType: slip.mime || "image/png",
    encoding: "base64",
    contentDisposition: "attachment",
  };
}

async function attemptTransport({ host, port, secure }) {
  const t = nodemailer.createTransport({
    host, port, secure,
    auth: { user: USER, pass: PASS },
    // ความเสถียร + ดีบัก
    requireTLS: !secure,                  // ถ้า 587 -> STARTTLS
    tls: { servername: host, minVersion: "TLSv1.2" },
    connectionTimeout: 12000,
    socketTimeout: 25000,
    logger: true,                         // log คุยกับ SMTP
    debug: true,
  });
  console.log(`try smtp ${host}:${port}/${secure ? "ssl" : "starttls"}`);
  await t.verify();                       // ถ้ามีปัญหา จะ throw พร้อมรายละเอียดใน Logs
  return t;
}

// ใช้ค่าที่ตั้งไว้ก่อน → ถ้าไม่ได้ลองสลับ 465/587 ให้อัตโนมัติ
async function buildTransporter() {
  // 1) ถ้าผู้ใช้กำหนด PORT/SECURE มาแล้ว ให้ลองชุดนั้นก่อน
  if (PORT !== undefined) {
    try { return await attemptTransport({ host: HOST, port: PORT, secure: SECURE }); }
    catch (e) { console.warn("verify failed (env cfg):", e?.message); }
  }
  // 2) 465/SSL
  try { return await attemptTransport({ host: HOST, port: 465, secure: true }); }
  catch (e) { console.warn("verify failed (465):", e?.message); }
  // 3) 587/STARTTLS
  return await attemptTransport({ host: HOST, port: 587, secure: false });
}

// ----- handler -----
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")  return res.status(405).json({ error: "Method Not Allowed" });

  if (!USER || !PASS) {
    console.error("MAIL CREDS MISSING", { hasUser: !!USER, hasPass: !!PASS });
    return res.status(500).json({ error: "MAIL_CREDENTIALS_MISSING" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { name, phone, email, orderId, amount, bank, note,
            cart, itemsTotal, shipping, grandTotal, slip } = body;

    const att = makeAttachment(slip);
    console.log("slip?", !!slip, "len", slip?.base64?.length, "mime", slip?.mime, "hasAtt", !!att);

    // ✅ สร้าง transporter (verify + fallback 465→587)
    const transporter = await buildTransporter();

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
      from: FROM,                   // ควรเป็นเมลเดียวกับ USER เมื่อใช้ Gmail
      to: TO,
      replyTo: email || undefined,
      subject, text, html,
      attachments: att ? [att] : [],
    });

    console.log("sent id", mail.messageId);
    res.status(200).json({ ok: true, id: mail.messageId, attachmentCount: att ? 1 : 0 });
  } catch (err) {
    console.error("send-order error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}
