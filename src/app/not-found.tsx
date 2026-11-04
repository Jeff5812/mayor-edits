import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="page-shell flex min-h-dvh flex-col items-start justify-center gap-4 py-16">
      <h1 className="text-heading">This scene got cut.</h1>
      <p className="text-ash">The page you were looking for does not exist.</p>
      <Link href="/" className={buttonClass("outline")}>
        Back to the reel
      </Link>
    </main>
  );
}
