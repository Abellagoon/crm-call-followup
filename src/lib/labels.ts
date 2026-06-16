// ป้ายภาษาไทยของค่าต่าง ๆ + ตัวช่วย format

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  SUPERVISOR: "Manager",
  AGENT: "Staff",
};

export const STATUS_LABELS: Record<string, string> = {
  LAPSED: "ขาดฝาก",
  DEPOSITED: "ฝากแล้ว",
  ACTIVE: "ยังเล่นอยู่",
  DO_NOT_CALL: "ห้ามโทร",
};

export const STATUS_COLORS: Record<string, string> = {
  LAPSED: "badge-yellow",
  DEPOSITED: "badge-green",
  ACTIVE: "badge-gray",
  DO_NOT_CALL: "badge-red",
};

export const OUTCOME_LABELS: Record<string, string> = {
  ANSWERED: "รับสาย",
  ANSWERED_HUNG_UP: "รับแล้ววางสาย",
  NO_ANSWER: "ไม่รับสาย",
  BUSY: "สายไม่ว่าง",
  INVALID: "เบอร์ผิด",
};

export const DISPOSITION_LABELS: Record<string, string> = {
  PROMO_20: "เสนอโปร 20%",
  INFO: "ให้ข้อมูลทั่วไป",
  NONE: "ไม่มี",
};

// outcome ที่ถือว่า "รับสาย"
export const ANSWERED_OUTCOMES = ["ANSWERED", "ANSWERED_HUNG_UP"];

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `${digits.slice(0, 3)}-xxx-${digits.slice(-4)}`;
}

const moneyFmt = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMoney(n: number): string {
  return moneyFmt.format(Math.round(n || 0));
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
