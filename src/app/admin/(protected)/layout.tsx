import type { ReactNode } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireAdmin } from "@/lib/auth/admin";

// Every page under here needs an administrator. Each page and action checks again for itself,
// because a layout does not re-run on every navigation.
export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();

  return (
    // Clipped both ways, because the room light is taller than a short page and must not make it scroll.
    <div className="relative isolate min-h-dvh overflow-clip">
      <div aria-hidden="true" className="room-light anim-lights" />
      <AdminHeader email={user.email} />
      {children}
    </div>
  );
}
