// โหลดข้อมูลจาก backups/export.json เข้า Postgres (Supabase) — รันหลังสลับ provider + prisma db push
// ใช้: node prisma/migrate-load.mjs
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const p = new PrismaClient();
const data = JSON.parse(fs.readFileSync("backups/export.json", "utf8"));
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// แปลง string วันที่ ISO กลับเป็น Date
function fix(rows) {
  return (rows || []).map((r) => {
    const o = { ...r };
    for (const k in o) if (typeof o[k] === "string" && ISO.test(o[k])) o[k] = new Date(o[k]);
    return o;
  });
}

// ลำดับตาม FK (parent ก่อน child)
const order = [
  ["role", data.role],
  ["brand", data.brand],
  ["campaign", data.campaign],
  ["notificationSetting", data.notificationSetting],
  ["smsTemplate", data.smsTemplate],
  ["user", data.user],
  ["customer", data.customer],
  ["campaignContact", data.campaignContact],
  ["callLog", data.callLog],
  ["depositEvent", data.depositEvent],
  ["bonusAdjustment", data.bonusAdjustment],
  ["auditLog", data.auditLog],
  ["smsLog", data.smsLog],
  ["importBatch", data.importBatch],
];

const seqTables = [
  "Role", "Brand", "Campaign", "NotificationSetting", "SmsTemplate", "User", "Customer",
  "CampaignContact", "CallLog", "DepositEvent", "BonusAdjustment", "AuditLog", "SmsLog", "ImportBatch",
];

async function main() {
  for (const [model, rows] of order) {
    const fixed = fix(rows);
    for (let i = 0; i < fixed.length; i += 500) {
      await p[model].createMany({ data: fixed.slice(i, i + 500) });
    }
    console.log(`  ${model}: ${fixed.length}`);
  }
  // ขยับ sequence ของ id ให้เลยค่า max (กัน id ชนตอน insert ใหม่)
  for (const t of seqTables) {
    await p.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${t}"','id'), COALESCE((SELECT MAX(id) FROM "${t}"),1))`
    );
  }
  console.log("โหลดข้อมูลขึ้น Postgres เสร็จ + ขยับ sequence แล้ว");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
