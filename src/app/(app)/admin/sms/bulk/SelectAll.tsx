"use client";

// checkbox หัวตาราง — กดแล้วติ๊ก/ยกเลิก ทุกเบอร์ที่แสดงในฟอร์มเดียวกัน
export default function SelectAll() {
  return (
    <input
      type="checkbox"
      title="เลือก/ยกเลิกทั้งหมด"
      onChange={(e) => {
        const form = e.currentTarget.closest("form");
        if (!form) return;
        form
          .querySelectorAll<HTMLInputElement>('input[name="ids"]:not([disabled])')
          .forEach((el) => {
            el.checked = e.currentTarget.checked;
          });
      }}
    />
  );
}
