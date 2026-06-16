// แคตตาล็อกสิทธิ์ทั้งหมดในระบบ (ใช้ได้ทั้ง client/server)

export type PermKey =
  | "dashboard"
  | "queue"
  | "view_all"
  | "customers"
  | "customers_export"
  | "reports"
  | "agents_report"
  | "notifications"
  | "import"
  | "manage_users"
  | "admin";

export const PERMISSIONS: { key: PermKey; label: string; group: string }[] = [
  { key: "dashboard", label: "ดูแดชบอร์ด", group: "ทั่วไป" },
  { key: "queue", label: "คิวโทร / บันทึกผลสาย", group: "ทั่วไป" },
  { key: "view_all", label: "เห็นงานของทุกคน (ไม่ใช่แค่ของตัวเอง)", group: "ทั่วไป" },
  { key: "customers", label: "ดูข้อมูลลูกค้า", group: "ลูกค้า" },
  { key: "customers_export", label: "ส่งออก/ดาวน์โหลดข้อมูลลูกค้า", group: "ลูกค้า" },
  { key: "reports", label: "รายงานสรุป", group: "รายงาน" },
  { key: "agents_report", label: "รายงานผลงานพนักงาน", group: "รายงาน" },
  { key: "notifications", label: "ตั้งค่าแจ้งเตือน", group: "ระบบ" },
  { key: "import", label: "นำเข้า/ส่งออกข้อมูล (Sheet/Excel)", group: "ระบบ" },
  { key: "manage_users", label: "เพิ่ม/จัดการผู้ใช้ (ตั้งบทบาทได้ทุกระดับ ยกเว้น Administrator)", group: "ระบบ" },
  { key: "admin", label: "จัดการผู้ใช้และบทบาท (เต็มสิทธิ์)", group: "ระบบ" },
];

export const ALL_PERMS: PermKey[] = PERMISSIONS.map((p) => p.key);

export function parsePermissions(json: string | null | undefined): PermKey[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr.filter((x): x is PermKey => typeof x === "string");
  } catch {
    /* ignore */
  }
  return [];
}

export function hasPermission(perms: string[], key: PermKey): boolean {
  return perms.includes(key);
}
