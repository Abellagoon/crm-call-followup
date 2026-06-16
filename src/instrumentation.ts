// Next.js เรียก register() ครั้งเดียวตอน server เริ่ม — ใช้สตาร์ท scheduler ส่งสรุปอัตโนมัติ (ข้อ 12)
export async function register() {
  // ทำเฉพาะ Node.js runtime (ไม่ใช่ edge) — scheduler ใช้ prisma + node-cron
  // ข้ามบน Vercel: serverless รัน process ค้างไม่ได้ → ใช้ Vercel Cron (vercel.json) ยิง /api/cron/summary แทน
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
