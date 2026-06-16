import { requireSession } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";
import EditProfileForm from "./EditProfileForm";

export default async function ProfilePage() {
  const user = await requireSession();

  return (
    <>
      <h1 className="page-title">โปรไฟล์ของฉัน</h1>
      <p className="page-sub">ข้อมูลบัญชีและการตั้งค่าความปลอดภัย</p>

      <div className="grid grid-2">
        <div className="card">
          <h2 className="card-title">ข้อมูลผู้ใช้</h2>
          <EditProfileForm
            displayName={user.displayName}
            username={user.username}
            roleName={user.roleName}
          />
        </div>

        <div className="card">
          <h2 className="card-title">เปลี่ยนรหัสผ่าน</h2>
          <ChangePasswordForm />
        </div>
      </div>
    </>
  );
}
