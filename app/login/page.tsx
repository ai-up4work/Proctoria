// app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";

export default function LoginPage() {
  const [idNumber, setIdNumber] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"student" | "proctor">("student");
  const [error, setError] = useState<string | null>(null);
  const { login } = useSession();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = idNumber.trim();
    if (!/^[A-Za-z0-9-]{3,}$/.test(trimmed)) {
      setError("Enter a valid ID number (letters, numbers, at least 3 characters).");
      return;
    }
    login(trimmed, name.trim() || trimmed, role);
    router.push(role === "proctor" ? "/proctor/dashboard" : "/exam/demo-exam/sit");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 rounded-2xl border border-cyan-500/30 bg-slate-900/60 p-8">
        <div>
          <h1 className="text-xl font-bold">PROCTORIA sign in</h1>
          <p className="text-sm text-slate-400 mt-1">Mock ID-based login — no password required.</p>
        </div>

        <div className="flex gap-2 text-sm">
          {(["student", "proctor"] as const).map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 rounded-md border px-3 py-2 capitalize ${
                role === r ? "border-cyan-400 bg-cyan-500/10 text-cyan-300" : "border-slate-700 text-slate-400"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">ID number</label>
          <input
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="e.g. S1024567"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Display name (optional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Doe"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          className="w-full rounded-md bg-gradient-to-r from-blue-600 to-cyan-500 py-2 text-sm font-semibold text-white"
        >
          Continue
        </button>
      </form>
    </div>
  );
}