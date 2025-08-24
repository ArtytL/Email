// /api/send-order.js  — Vercel serverless (ESM)
import nodemailer from "nodemailer";

const ORIGIN = process.env.ALLOW_DEBUG_ORIGIN || "http://localhost:5173";
const USER   = process.env.GMAIL_USER;
const PASS   = process.env.GMAIL_APP_PASS;

// แปลง slip.base64 → แนบทั้งแบบ inline (cid) และไฟล์แนบจริง
function makeAttachments(slip) {
  if (!slip?.base64) return [];
  const raw = String(slip.base64);
  const b64 = raw.includes(",") ? raw.split(",")[1] : raw;
  const filename = slip.filename || "slip.png";
  const mime = slip.mime || "image/png";
  const buf = Buffer.from(b64, "base64");
  return [
    // แสดงในเนื้อเมล
    { filename, content: buf, contentType: mime, encoding: "base64", cid: "slip-inline" },
    // เป็นไฟล์แนบจริง ๆ
    { filename, content: buf, contentType: mime, encoding: "base64", contentDisposition: "attachment" },
  ];
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")  return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const {
      name, phone, email, orderId, amount, bank, note,
      cart, itemsTotal, shipping, grandTotal, slip
    } = body;

    const attachments = makeAttachments(slip);

    // logs ดีบัก
    console.log("slip?", !!slip, "len", slip?.base64?.length, "mime", slip?.mime);
    console.log("attachments length", attachments.length);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: USER, pass: PASS },
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
      cart?.length ? `ยอดสินค้า: ${itemsTotal}฿ | ค่าส่ง: ${shipping}฿ | รวม: ${grandTotal}฿` : ""
    ].filter(Boolean).join("\n");

    const html = `
      <div style="font-family:system-ui,sans-serif">
        <h2>แจ้งโอน ${orderId || "-"}</h2>
        <p><b>ชื่อ:</b> ${name || "-"} | <b>เบอร์:</b> ${phone || "-"}</p>
        <p><b>อีเมล:</b> ${email || "-"}</p>
        <p><b>ยอดโอน:</b> ${amount || "-"} | <b>ธนาคาร:</b> ${bank || "-"}</p>
        ${note ? `<p><b>หมายเหตุ:</b> ${note}</p>` : ""}
        ${Array.isArray(cart) && cart.length ? `
          <hr/>
          <h3>รายการ</h3>
          <ul>${cart.map(x => `<li>${x.title} x${x.qty} = <b>${x.price * x.qty}฿</b></li>`).join("")}</ul>
          <p>ยอดสินค้า: <b>${itemsTotal}฿</b> | ค่าส่ง: <b>${shipping}฿</b> | รวม: <b>${grandTotal}฿</b></p>
        ` : ""}
        ${attachments.length ? `<hr/><p><img src="cid:slip-inline" style="max-width:480px;border:1px solid #eee;border-radius:8px"/></p>` : ""}
      </div>
    `;

    const mail = await transporter.sendMail({
      from: `โล๊ะแผ่นมือ 2 <${USER}>`,
      to: USER,                     // ส่งเข้ากล่องของร้าน
      replyTo: email || undefined,  // กดตอบกลับถึงลูกค้าได้
      subject,
      text,
      html,
      attachments,                  // ⭐ แนบสลิปทั้งแบบ inline + ไฟล์แนบ
    });

    console.log("sent id", mail.messageId);
    return res.status(200).json({ ok: true, id: mail.messageId, attachmentCount: attachments.length });
  } catch (err) {
    console.error("send-order error:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
