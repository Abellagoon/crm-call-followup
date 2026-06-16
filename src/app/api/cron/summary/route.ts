import { NextRequest } from "next/server";
import { getSetting, sendSummary } from "@/lib/telegram";

// ข้อ 12: cron สรุปรายวัน/รายสัปดาห์
// เรียกใช้: GET /api/cron/summary?period=daily|weekly  (ตั้ง cron มายิง URL นี้)
// ความปลอดภัย: ถ้าตั้ง CRON_SECRET ใน .env จะต้องส่ง ?key=<secret> หรือ header Authorization: Bearer <secret>
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key =
      req.nextUrl.searchParams.get("key") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (key !== secret) return new Response("unauthorized", { status: 401 });
  }

  const period = req.nextUrl.searchParams.get("period") === "weekly" ? "weekly" : "daily";
  const toggleKey = period === "weekly" ? "notify_weekly_summary" : "notify_daily_summary";

  // เคารพการตั้งค่าเปิด-ปิดในหน้า /admin/notifications
  if ((await getSetting(toggleKey, "0")) !== "1") {
    return Response.json({ ok: false, skipped: true, reason: `ปิดการแจ้งเตือนสรุป${period === "weekly" ? "รายสัปดาห์" : "รายวัน"}ไว้` });
  }

  const r = await sendSummary(period);
  return Response.json({ period, ...r });
}
