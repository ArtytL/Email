// helper อ่าน JSON อยู่บนสุด
async function readJSON(req) { /* ตามที่วางไว้ */ }

// … import nodemailer และฟังก์ชัน withCORS ของเดิม …

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return withCORS(res).status(200).end();
  }
  if (req.method !== "POST") {
    return withCORS(res).status(405).json({ ok:false, error:"Method Not Allowed" });
  }

  // อ่าน body
  const payload = await readJSON(req);
  const { orderId, items, total, customer, bank, slipDataURL } = payload || {};

  // === ส่งเมลจริง (อย่าคอมเมนต์ส่วนนี้) ===
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: !!Number(process.env.SMTP_SECURE || 0),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const attachments = slipDataURL
    ? [{ filename: `slip-${orderId}.png`, content: Buffer.from(slipDataURL.split(',')[1] || "", "base64") }]
    : [];

  const html = /* สร้าง HTML ตามของเดิม */ `
    <h3>ออร์เดอร์ใหม่ #${orderId}</h3>
    <p>ลูกค้า: ${customer?.name} (${customer?.phone})</p>
    <p>รวม: ฿${total}</p>
  `;

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.TO_EMAIL,
    replyTo: customer?.email || undefined,
    subject: `โล๊ะเเผ่นมือ 2 ออร์เดอร์ใหม่ ${orderId} (฿${total})`,
    html,
    attachments,
  });

  return withCORS(res).status(200).json({ ok:true, messageId: info.messageId });
}
