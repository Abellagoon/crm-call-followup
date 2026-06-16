"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSetting, setSetting, sendTelegram, sendSummary } from "@/lib/telegram";

async function ensure() {
  const me = await requireSession();
  if (!can(me, "notifications")) throw new Error("ไม่มีสิทธิ์");
  return me;
}

export async function saveNotificationSettings(formData: FormData) {
  const me = await ensure();

  await setSetting("team_chat_id", String(formData.get("team_chat_id") || "").trim());
  await setSetting("head_chat_id", String(formData.get("head_chat_id") || "").trim());
  await setSetting(
    "big_deposit_threshold",
    String(formData.get("big_deposit_threshold") || "5000").trim()
  );
  await setSetting("notify_callback", formData.get("notify_callback") === "on" ? "1" : "0");
  await setSetting(
    "notify_big_deposit",
    formData.get("notify_big_deposit") === "on" ? "1" : "0"
  );
  await setSetting("notify_daily_summary", formData.get("notify_daily_summary") === "on" ? "1" : "0");
  await setSetting("notify_weekly_summary", formData.get("notify_weekly_summary") === "on" ? "1" : "0");
  // เวลาส่งสรุปอัตโนมัติ (HH:MM เวลาไทย) + วันของสรุปรายสัปดาห์ (0=อา..6=ส)
  const t = String(formData.get("summary_time") || "23:00").trim();
  await setSetting("summary_time", /^\d{2}:\d{2}$/.test(t) ? t : "23:00");
  await setSetting("weekly_summary_dow", String(formData.get("weekly_summary_dow") || "1"));

  await audit(me, {
    action: "settings.notifications",
    entity: "settings",
    entityId: null,
    summary: `แก้ไขการตั้งค่าแจ้งเตือน Telegram`,
  });

  revalidatePath("/admin/notifications");
  redirect("/admin/notifications?saved=1");
}

// ส่งสรุปทันที (ปุ่มทดสอบในหน้าตั้งค่า) — ไม่เช็ค toggle เพื่อให้ลองได้เสมอ
export async function sendSummaryNow(formData: FormData) {
  await ensure();
  const period = String(formData.get("period") || "daily") === "weekly" ? "weekly" : "daily";
  const r = await sendSummary(period);
  const kind = r.ok ? "ok" : r.skipped ? "warn" : "err";
  const msg = r.ok ? `ส่งสรุป${period === "weekly" ? "รายสัปดาห์" : "รายวัน"}สำเร็จ` : r.error || "ส่งไม่สำเร็จ";
  redirect(`/admin/notifications?test=${kind}&msg=${encodeURIComponent(msg)}`);
}

export async function testSend(formData: FormData) {
  await ensure();

  const target = String(formData.get("target") || "team");
  const chat = await getSetting(target === "head" ? "head_chat_id" : "team_chat_id");
  const r = await sendTelegram(chat, "🔔 ทดสอบการแจ้งเตือนจากระบบ CRM");

  const kind = r.ok ? "ok" : r.skipped ? "warn" : "err";
  const msg = r.ok ? "ส่งสำเร็จ" : r.error || "ส่งไม่สำเร็จ";
  redirect(`/admin/notifications?test=${kind}&msg=${encodeURIComponent(msg)}`);
}
