import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return withCORS(res).status(200).end();
  }
  if (req.method !== "POST") {
    return withCORS(res).status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const { orderId, items, total, customer, bank, slipDataURL } = req.body || {};
    if (!orderId || !items || !total || !customer?.name || !customer?.phone) {
      return withCORS(res).status(400).json({ ok: false, error: "Bad payload" });
    }
// 👇 debug ENV ที่ runtime ใช้อยู่จริง

  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  user: process.env.SMTP_USER,
});

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: !!Number(process.env.SMTP_SECURE || 0),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const rows = items
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.title)}</td><td align="right">${i.qty}</td><td align="right">฿${fmt(
            i.price
          )}</td><td align="right">฿${fmt(i.price * i.qty)}</td></tr>`
      )
      .join("");

    const html = `
      <h2>คำสั่งซื้อใหม่: ${escapeHtml(orderId)}</h2>
      <p><b>ลูกค้า:</b> ${escapeHtml(customer.name)} (${escapeHtml(customer.phone)})</p>
      <table border="1" cellspacing="0" cellpadding="6">${rows}</table>
      <p><b>ยอดสุทธิ:</b> ฿${fmt(total)}</p>
    `;

    const attachments = [];
    if (slipDataURL && typeof slipDataURL === "string" && slipDataURL.startsWith("data:")) {
      const [meta, b64] = slipDataURL.split(",");
      const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png";
      attachments.push({
        filename: `slip-${orderId}.${mime.split("/")[1] || "png"}`,
        content: Buffer.from(b64, "base64"),
        contentType: mime,
      });
    }

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.TO_EMAIL,
      replyTo: customer?.email ? { name: customer.name || "", address: customer.email } : undefined,
      subject: `[โล๊ะแผ่นมือ 2] ออร์เดอร์ใหม่ ${orderId} (฿${fmt(total)})`,
      html,
      attachments,
    });

    return withCORS(res).status(200).json({ ok: true, messageId: info.messageId });
  } catch (e) {
    console.error(e);
    return withCORS(res).status(500).json({ ok: false, error: e.message });
  }
}

function withCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOW_DEBUG_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function fmt(n) {
  try {
    return Number(n).toLocaleString("th-TH");
  } catch {
    return String(n);
  }
}
function escapeHtml(str = "") {
  return String(str).replace(/[&<>\"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}
