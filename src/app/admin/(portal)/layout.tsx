import { requireAdmin } from "@/lib/server/auth";
import { ROLE_LABELS } from "@/lib/config";
import AdminNav from "./admin-nav";
import IdleSignOut from "./idle-sign-out";
import { RememberListFilters } from "@/components/back-link";

export default async function PortalLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin({ transportation: true });
  return (
    <div className="flex min-h-dvh flex-1">
      <AdminNav rank={admin.role} name={admin.display_name} role={ROLE_LABELS[admin.role]} />
      <IdleSignOut />
      <RememberListFilters />
      <main className="min-w-0 flex-1 px-4 pb-28 pt-[4.5rem] sm:px-6 md:pb-10 md:pt-5 lg:px-10">{children}</main>
    </div>
  );
}
