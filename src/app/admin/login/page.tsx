import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { SetPasswordForm } from "@/components/admin/SetPasswordForm";
import { panelClass } from "@/components/admin/styles";
import { assertAdmin } from "@/lib/auth/admin";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

// Reads the URL and the session, so it cannot render ahead of the request.
export const instant = false;

async function isSignedInAdmin() {
  try {
    await assertAdmin();
    return true;
  } catch {
    return false;
  }
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string | string[] }>;
}) {
  const { flow } = await searchParams;
  const settingPassword = flow === "set-password";

  // Only administrators are sent on, so a signed-in non-admin cannot bounce between the two pages.
  if (!settingPassword && (await isSignedInAdmin())) redirect("/admin");

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className={`w-full max-w-md ${panelClass}`}>
        <p className="text-sm text-ash">{SITE.name}</p>
        <h1 className="mt-3 text-2xl font-medium tracking-tight text-bone">{settingPassword ? "Choose your password" : "Admin sign in"}</h1>
        <div className="mt-8">{settingPassword ? <SetPasswordForm /> : <LoginForm />}</div>
      </div>
    </main>
  );
}
