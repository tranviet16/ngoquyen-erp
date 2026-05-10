import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function PermissionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Phân quyền</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý quyền truy cập module và dự án cho từng người dùng.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/permissions/modules" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Phân quyền module</CardTitle>
              <CardDescription>
                Ma trận người dùng × module. Chỉnh sửa đồng loạt và lưu trong
                một giao dịch.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-muted-foreground">
                16 module · tối đa 20 người dùng
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/permissions/projects" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Phân quyền dự án</CardTitle>
              <CardDescription>
                Cấp quyền theo từng dự án hoặc toàn bộ dự án cho mỗi người
                dùng.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-muted-foreground">
                Hỗ trợ ngoại lệ theo từng dự án (D3)
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
