import "server-only";
import { prisma } from "@/lib/db";

export type SmsResult = { ok: boolean; skipped?: boolean; error?: string };

// แทนค่าตัวแปรในเทมเพลต เช่น {phone} {brand} — ตัวแปรที่ไม่รู้จักจะคงไว้เดิม
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

async function smsSetting(key: string): Promise<string> {
  const r = await prisma.notificationSetting.findUnique({ where: { key } });
  return r?.value ?? "";
}

// ส่ง SMS ผ่าน gateway แบบ generic: URL ที่ผู้ดูแลตั้งไว้ มี placeholder {phone} {message}
// (รองรับ gateway แบบ HTTP GET ที่พบทั่วไป) — ไม่ throw, คืนผลลัพธ์ให้ผู้เรียกบันทึก log
export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const enabled = (await smsSetting("sms_enabled")) === "1";
  const url = (await smsSetting("sms_gateway_url")).trim();
  if (!enabled || !url) {
    return { ok: false, skipped: true, error: "ยังไม่ได้เปิดใช้งาน/ตั้งค่า SMS gateway" };
  }
  const finalUrl = url
    .replace(/\{phone\}/g, encodeURIComponent(phone))
    .replace(/\{message\}/g, encodeURIComponent(message));
  try {
    const res = await fetch(finalUrl, { method: "GET" });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Gateway ตอบกลับ ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
