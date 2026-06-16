import "server-only";
import { prisma } from "@/lib/db";
import { getBrandSummary } from "@/lib/report";
import { bangkokDayStart, bangkokWeekStart } from "@/lib/dates";
import { formatPhone, formatMoney, formatDate } from "@/lib/labels";

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await prisma.notificationSetting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await prisma.notificationSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export type SendResult = { ok: boolean; skipped?: boolean; error?: string };

// ส่งข้อความเข้า Telegram — token เก็บใน .env เท่านั้น (ห้าม hardcode)
export async function sendTelegram(
  chatId: string,
  text: string
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token)
    return { ok: false, skipped: true, error: "ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN ใน .env" };
  if (!chatId)
    return { ok: false, skipped: true, error: "ยังไม่ได้ตั้ง chat id ของกลุ่มนี้" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Telegram ตอบกลับ ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// แจ้งเตือนนัดโทรกลับ (เชื่อมข้อ 6 → ข้อ 12) — ส่งไม่ได้ก็ไม่ทำให้งานหลักพัง
export async function notifyCallback(text: string) {
  try {
    if ((await getSetting("notify_callback", "1")) !== "1") return;
    const chat = await getSetting("team_chat_id");
    await sendTelegram(chat, text);
  } catch (e) {
    console.error("notifyCallback failed:", e);
  }
}

// ข้อ 12: แจ้งยอดฝาก/โบนัสก้อนใหญ่ (เกินเกณฑ์ที่ตั้งไว้) — ไม่ throw
export async function notifyBigAmount(opts: {
  kind: "deposit" | "bonus";
  amount: number;
  phone: string;
  brand: string;
  by?: string;
}) {
  try {
    if ((await getSetting("notify_big_deposit", "0")) !== "1") return;
    const threshold = Number(await getSetting("big_deposit_threshold", "5000")) || 5000;
    if (opts.amount < threshold) return;
    const chat = await getSetting("team_chat_id");
    const label = opts.kind === "deposit" ? "ยอดฝากก้อนใหญ่" : "โบนัสก้อนใหญ่";
    const emoji = opts.kind === "deposit" ? "💰" : "🎁";
    await sendTelegram(
      chat,
      `${emoji} <b>${label}</b>\n` +
        `เว็บ ${opts.brand}\n` +
        `เบอร์ ${formatPhone(opts.phone)}\n` +
        `ยอด ${formatMoney(opts.amount)} บาท (เกณฑ์ ${formatMoney(threshold)})` +
        (opts.by ? `\nโดย ${opts.by}` : "")
    );
  } catch (e) {
    console.error("notifyBigAmount failed:", e);
  }
}

// ข้อ 12: สร้าง+ส่งสรุปผลการติดตาม (รายวัน/รายสัปดาห์) เข้ากลุ่มทีม
export async function sendSummary(period: "daily" | "weekly"): Promise<SendResult> {
  const now = new Date();
  const from = period === "daily" ? bangkokDayStart(now) : bangkokWeekStart(now);
  const rows = await getBrandSummary(from, now);
  const tot = rows.reduce(
    (a, r) => ({
      calls: a.calls + r.calls,
      answered: a.answered + r.answered,
      returnedPeople: a.returnedPeople + r.returnedPeople,
      deposit: a.deposit + r.deposit,
      bonus: a.bonus + r.bonus,
    }),
    { calls: 0, answered: 0, returnedPeople: 0, deposit: 0, bonus: 0 }
  );
  const pct = tot.calls ? Math.round((tot.answered / tot.calls) * 100) : 0;
  const title =
    period === "daily"
      ? `📊 <b>สรุปประจำวัน</b> ${formatDate(from)}`
      : `📈 <b>สรุปรายสัปดาห์</b> (ตั้งแต่ ${formatDate(from)})`;
  const text =
    `${title}\n` +
    `โทรทั้งหมด: ${formatMoney(tot.calls)} สาย (รับ ${formatMoney(tot.answered)} · ${pct}%)\n` +
    `กลับมาฝาก: ${formatMoney(tot.returnedPeople)} คน\n` +
    `ยอดฝากกลับ: ${formatMoney(tot.deposit)} บาท\n` +
    `โบนัส: ${formatMoney(tot.bonus)} บาท`;
  const chat = await getSetting("team_chat_id");
  return sendTelegram(chat, text);
}
