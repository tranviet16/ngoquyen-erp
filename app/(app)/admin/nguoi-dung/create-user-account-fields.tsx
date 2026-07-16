import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AccountOption {
  id: string | number;
  name: string;
}

export interface AccountForm {
  name: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
  departmentId: string;
}

export function CreateUserAccountFields({
  form,
  roles,
  departments,
  showPassword,
  error,
  onChange,
  onTogglePassword,
}: {
  form: AccountForm;
  roles: AccountOption[];
  departments: AccountOption[];
  showPassword: boolean;
  error: string;
  onChange: (key: keyof AccountForm, value: string) => void;
  onTogglePassword: () => void;
}) {
  const inputClass = "text-base md:text-sm";
  return (
    <div className="grid gap-4 overflow-y-auto overscroll-contain px-4 pb-4 sm:grid-cols-2 sm:px-0">
      <Field label="Họ và tên" htmlFor="new-name">
        <Input
          id="new-name"
          required
          maxLength={120}
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Tên đăng nhập" htmlFor="new-username">
        <Input
          id="new-username"
          required
          minLength={3}
          maxLength={30}
          pattern="[A-Za-z0-9_.]+"
          autoCapitalize="none"
          value={form.username}
          onChange={(e) => onChange("username", e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Email" htmlFor="new-email" className="sm:col-span-2">
        <Input
          id="new-email"
          type="email"
          required
          autoCapitalize="none"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Mật khẩu khởi tạo" htmlFor="new-password">
        <div className="relative">
          <Input
            id="new-password"
            type={showPassword ? "text" : "password"}
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => onChange("password", e.target.value)}
            className="pr-12 text-base md:text-sm"
          />
          <button
            type="button"
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            onClick={onTogglePassword}
            className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </Field>
      <Field label="Xác nhận mật khẩu" htmlFor="new-confirm-password">
        <Input
          id="new-confirm-password"
          type={showPassword ? "text" : "password"}
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => onChange("confirmPassword", e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Vai trò" htmlFor="new-role">
        <select
          id="new-role"
          required
          value={form.role}
          onChange={(e) => onChange("role", e.target.value)}
          className="h-11 w-full rounded-md border bg-background px-3 text-base md:h-10 md:text-sm"
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Phòng ban" htmlFor="new-department">
        <select
          id="new-department"
          value={form.departmentId}
          onChange={(e) => onChange("departmentId", e.target.value)}
          className="h-11 w-full rounded-md border bg-background px-3 text-base md:h-10 md:text-sm"
        >
          <option value="">— Không —</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
