import cron from "node-cron";
import { prisma } from "@/lib/db";
import { sendSummary } from "@/lib/telegram";

// ข้อ 12: ตัวตั้งเวลาในแอป — เช็คทุกนาที ถ้าตรงเวลาที่ตั้ง + เปิดสวิตช์ → ส่งสรุปเข้า Telegram
// (เวลาอิงเขตเวลาไทย UTC+7 เหมือน lib/dates.ts) — เปลี่ยนเวลาในหน้า 4.4 มีผลทันทีไม่ต้องรีสตาร์ท
let started = false;
let lastDaily = ""; // YYYY-MM-DD ที่ส่งสรุปรายวันไปแล้ว (กันส่งซ้ำ)
let lastWeekly = "";

function nowBangkok() {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000); // เลื่อนเป็นเวลาไทย แล้วอ่านด้วย getUTC*
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return { time: `${hh}:${mm}`, dow: d.getUTCDay(), date: d.toISOString().slice(0, 10) };
}

async function getSetting(key: string, fallback = ""): Promise<string> {
  const r = await prisma.notificationSetting.findUnique({ where: { key } });
  return (r?.value ?? fallback).trim() || fallback;
}

export function startScheduler() {
  if (started) return;
  started = true;

  cron.schedule("* * * * *", async () => {
    try {
      const { time, dow, date } = nowBangkok();
      const target = await getSetting("summary_time", "23:00");
      // catch-up: ส่งเมื่อถึง/เลยเวลาที่ตั้งแล้ว (กันพลาดถ้าเครื่องเพิ่งตื่นหลังเวลานั้น) — ส่งวันละครั้ง
      if (time < target) return;

      const weeklyDow = Number(await getSetting("weekly_summary_dow", "0"));
      const isWeeklyDay = dow === weeklyDow;

      // รายวัน: ทุกวัน "ยกเว้น" วันสรุปรายสัปดาห์ (เช่น ตั้งอาทิตย์ = จ-ส ส่งรายวัน)
      if (
        !isWeeklyDay &&
        (await getSetting("notify_daily_summary", "0")) === "1" &&
        lastDaily !== date
      ) {
        lastDaily = date;
        const r = await sendSummary("daily");
        console.log("[scheduler] ส่งสรุปรายวัน:", r.ok ? "สำเร็จ" : r.error || "skip");
      }

      // รายสัปดาห์: เฉพาะวันที่เลือก (เช่น อาทิตย์) — วันนั้นไม่ส่งรายวัน
      if (
        isWeeklyDay &&
        (await getSetting("notify_weekly_summary", "0")) === "1" &&
        lastWeekly !== date
      ) {
        lastWeekly = date;
        const r = await sendSummary("weekly");
        console.log("[scheduler] ส่งสรุปรายสัปดาห์:", r.ok ? "สำเร็จ" : r.error || "skip");
      }
    } catch (e) {
      console.error("[scheduler] error:", e);
    }
  });

  console.log("[scheduler] เริ่มทำงาน — เช็คทุกนาที ส่งสรุปตามเวลาที่ตั้งในหน้า 4.4");
}
