# กติกาส่งงาน (ทุกข้อ)

1. แตก branch จาก `main` ชื่อ `homework/<เลขข้อ>-<ชื่อสั้น>` เช่น `homework/01-change-password`
2. ส่งเป็น Pull Request พร้อมอธิบาย: ทำอะไร, ทดสอบยังไง, มี screenshot
3. **เกณฑ์ขั้นต่ำที่ทุกข้อต้องผ่าน:**
   - ใช้งานได้จริงกับข้อมูลที่อยู่ในระบบ
   - เช็คสิทธิ์ถูกต้อง (agent เห็นเฉพาะของตัวเอง / หน้ารายงาน-ตั้งค่าเฉพาะหัวหน้าขึ้นไป / หน้า admin เฉพาะ ADMIN)
   - `npm run build` ผ่านโดยไม่มี error
   - UI เป็นภาษาไทย สไตล์เดียวกับหน้าอื่น (ใช้คลาส `card`, `btn-primary`, `input`, `th`, `td` ที่มีอยู่ใน `globals.css`)
4. ห้าม hardcode ค่าลับ (token, รหัสผ่าน) — ใส่ใน `.env` เสมอ

## ลำดับ branch ของการบ้าน
| ข้อ | branch |
|---|---|
| 1 | `homework/01-change-password` |
| 2 | `homework/02-export-customers` |
| 3 | `homework/03-queue-filters` |
| 4 | `homework/04-reports` |
| 5 | `homework/05-export-reports` |
| 6 | `homework/06-appointment-calllog` |
| 7 | `homework/07-dnc` |
| 8 | `homework/08-agent-performance` |
| 9 | `homework/09-cohort` |
| 10 | `homework/10-audit-log` |
| 11 | `homework/11-sms` |
| 12 | `homework/12-telegram` |
