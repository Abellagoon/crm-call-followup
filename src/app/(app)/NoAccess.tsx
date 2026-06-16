import Link from "next/link";

export default function NoAccess({ message }: { message?: string }) {
  return (
    <div className="card" style={{ maxWidth: 520, marginTop: 40 }}>
      <h1 className="card-title">🔒 ไม่มีสิทธิ์เข้าถึง</h1>
      <p className="muted">
        {message ?? "บัญชีของคุณไม่มีสิทธิ์ดูหน้านี้ — ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม"}
      </p>
      <Link href="/" className="btn-primary" style={{ marginTop: 8, display: "inline-flex" }}>
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
