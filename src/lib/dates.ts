// ตัวช่วยวันที่อิงเขตเวลาไทย (UTC+7)
// แนวคิด: เก็บใน DB เป็น UTC แต่ "ขอบวัน" คิดตามเวลาไทย

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

// คืนค่า Date (UTC) ที่ตรงกับ 00:00:00 ของวันนั้นตามเวลาไทย
export function bangkokDayStart(d: Date = new Date()): Date {
  const shifted = new Date(d.getTime() + BKK_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - BKK_OFFSET_MS);
}

export function bangkokDayEnd(d: Date = new Date()): Date {
  const start = bangkokDayStart(d);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

// ต้นสัปดาห์ (วันจันทร์ 00:00) ตามเวลาไทย
export function bangkokWeekStart(d: Date = new Date()): Date {
  const start = bangkokDayStart(d);
  const shifted = new Date(start.getTime() + BKK_OFFSET_MS);
  const dow = shifted.getUTCDay(); // 0=อาทิตย์ .. 6=เสาร์
  const sinceMon = dow === 0 ? 6 : dow - 1;
  return new Date(start.getTime() - sinceMon * 24 * 60 * 60 * 1000);
}

// ต้นเดือนปัจจุบันตามเวลาไทย
export function bangkokMonthStart(d: Date = new Date()): Date {
  const shifted = new Date(d.getTime() + BKK_OFFSET_MS);
  shifted.setUTCDate(1);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - BKK_OFFSET_MS);
}

// แปลงค่าจาก <input type="date"> ("2026-06-01") เป็นต้นวันตามเวลาไทย
export function parseThaiDate(value: string): Date {
  return new Date(`${value}T00:00:00+07:00`);
}

// แปลง <input type="datetime-local"> ("2026-06-11T18:00") เป็นเวลาไทย
export function parseThaiDateTime(value: string): Date {
  return new Date(`${value}:00+07:00`);
}

// สำหรับ value ของ <input type="date">
export function toDateInputValue(d: Date): string {
  const shifted = new Date(d.getTime() + BKK_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

// สำหรับ value ของ <input type="datetime-local"> ("2026-06-11T18:00") ตามเวลาไทย
export function toDateTimeInputValue(d: Date): string {
  const shifted = new Date(d.getTime() + BKK_OFFSET_MS);
  return shifted.toISOString().slice(0, 16);
}
