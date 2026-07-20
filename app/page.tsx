// app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";

// This page renders nothing lasting — it just decides where to send the
// visitor based on session state, then redirects. Keeping this logic in
// one place means /login, /exam/..., and /proctor/dashboard don't each
// need their own "am I even logged in" redirect handling for the root case.
export default function RootPage() {
  const { session, initializing } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return; // wait for sessionStorage restore to finish
    if (!session) {
      router.replace("/login");
    } else if (session.role === "proctor") {
      router.replace("/proctor/dashboard");
    } else {
      // TODO: once you have a real exam list/API, redirect to that instead
      // of a hardcoded demo exam id.
      router.replace("/exam/demo-exam/sit");
    }
  }, [session, initializing, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
      Redirecting…
    </div>
  );
}