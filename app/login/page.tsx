// app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import Image from "next/image";

type Role = "student" | "proctor";

// Must match ID_PATTERN in lib/session.ts
const ID_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

const destinationFor = (role: Role) => (role === "proctor" ? "/proctor/dashboard" : "/exam/demo-exam/sit");

export default function LoginPage() {
  const [idNumber, setIdNumber] = useState("");
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(false);
  const { session, initializing, login } = useSession();
  const router = useRouter();

  const idLooksValid = ID_PATTERN.test(idNumber.trim());

  // "Your session expired" message when bounced here from the exam page.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "expired") setNotice("Your session expired. Please sign in again.");
  }, []);

  // Already signed in (verified by the server cookie via /api/me) -> go straight in.
  // This is also what navigates after a successful login below.
  useEffect(() => {
    if (!initializing && session) router.replace(destinationFor(session.role));
  }, [initializing, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = idNumber.trim();
    if (!ID_PATTERN.test(trimmed)) {
      setError("Enter a valid ID (letters, numbers, - or _, 3 to 32 characters).");
      return;
    }
    if (role === "proctor" && !passcode) {
      setError("Enter the proctor passcode.");
      return;
    }

    setError(null);
    setNotice(null);
    setSubmitting(true);
    setToast(true);

    try {
      // 1. Ask the server to issue the signed session cookie.
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trimmed, role, passcode: role === "proctor" ? passcode : undefined }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Sign-in failed. Please try again.");
        return;
      }

      // 2. Confirm the cookie stuck (via /api/me) and populate the context.
      //    The effect above then redirects to the right page.
      const verified = await login(trimmed, name.trim() || trimmed, role);
      if (!verified) {
        setError("Signed in, but your browser did not keep the session cookie. Check that cookies are enabled.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
      setTimeout(() => setToast(false), 800);
    }
  }

  if (initializing) return null; // wait for /api/me so a signed-in user doesn't see the form flash

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground font-body">
      {/* Top app bar — mobile only */}
      <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-border bg-card px-margin-mobile md:hidden">
        <div className="flex items-center gap-2">
          <Image src="/logo-only-removebg-preview.png" alt="Proctoria Logo" width={32} height={32} className="h-8 w-8 rounded-full" />
          <h1 className="font-display text-headline-md font-bold tracking-tight text-foreground">
            Proctoria
          </h1>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted md:hidden">
          <span className="material-symbols-outlined text-[18px] text-muted-foreground">language</span>
        </div>
      </header>

      {/* Content row: left logo panel (desktop) + right form panel */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Left panel — logo, desktop/laptop only */}
        <div className="relative hidden shrink-0 items-center justify-center overflow-hidden bg-background p-margin-desktop md:flex md:w-1/2">
          {/* soft glow behind the panel */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--secondary)/0.12),transparent_60%)]" />

          <div className="w-full max-w-[600px]">
            <Image
              src="/logo2.png"
              alt="Proctoria Logo"
              width={500}
              height={500}
              className="h-auto w-full object-contain"
              priority
            />
          </div>
        </div>

        {/* Right panel — login form */}
        <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-margin-mobile py-margin-tablet md:px-margin-desktop md:py-0">
          <div className="z-10 m-auto w-full max-w-sm md:max-w-[480px]">
            <div className="glass-effect flex flex-col gap-6 rounded-xl bg-card/80 p-margin-mobile shadow-2xl backdrop-blur-md md:p-margin-tablet">
              <div className="space-y-1 text-center">
                <p className="font-mono text-label-sm uppercase tracking-widest text-accent">
                  System Authentication
                </p>
                <h2 className="font-display text-headline-md tracking-tight text-foreground">
                  Terminal Authorization
                </h2>
                <p className="font-body text-body-sm text-muted-foreground">
                  Secure entry into the invigilation ecosystem
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Role toggle */}
                <div className="space-y-1.5">
                  <label className="px-1 font-mono text-label-md uppercase tracking-widest text-muted-foreground">
                    Access Role
                  </label>
                  <div className="grid grid-cols-2 gap-base rounded-xl border border-border bg-background p-1">
                    {(["student", "proctor"] as const).map((r) => (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setRole(r)}
                        aria-pressed={role === r}
                        className={`flex items-center justify-center gap-2 rounded-lg py-2 px-4 font-body text-body-sm capitalize transition-all duration-200 ${
                          role === r
                            ? "bg-secondary text-secondary-foreground shadow-sm ring-1 ring-inset ring-ring/40"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {r === "student" ? "school" : "policy"}
                        </span>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ID input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="id-number"
                    className="px-1 font-mono text-label-md uppercase tracking-widest text-muted-foreground"
                  >
                    {role === "proctor" ? "Proctor ID (any unique value)" : "Identification Number"}
                  </label>
                  <div className="group relative">
                    <span
                      className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-accent"
                      style={{ fontSize: 18 }}
                    >
                      fingerprint
                    </span>
                    <input
                      id="id-number"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      maxLength={32}
                      autoComplete="username"
                      placeholder={role === "proctor" ? "e.g. proctor1" : "e.g. S1024567"}
                      className="h-11 w-full rounded-lg border border-border bg-input pl-10 pr-10 font-mono text-body-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/40"
                    />
                    <span
                      className={`material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] transition-colors ${
                        idLooksValid ? "text-accent opacity-100" : "text-muted-foreground opacity-40"
                      }`}
                    >
                      {idLooksValid ? "verified_user" : "shield_with_heart"}
                    </span>
                  </div>
                  <p className="font-mono text-label-sm italic text-muted-foreground">
                    ID validation active through institutional gateway
                  </p>
                </div>

                {/* Proctor passcode — required by /api/login for the proctor role */}
                {role === "proctor" && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="proctor-passcode"
                      className="px-1 font-mono text-label-md uppercase tracking-widest text-muted-foreground"
                    >
                      Proctor Passcode
                    </label>
                    <div className="group relative">
                      <span
                        className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-accent"
                        style={{ fontSize: 18 }}
                      >
                        key
                      </span>
                      <input
                        id="proctor-passcode"
                        type="password"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="h-11 w-full rounded-lg border border-border bg-input pl-10 pr-3 font-mono text-body-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                  </div>
                )}

                {/* Name input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="full-name"
                    className="px-1 font-mono text-label-md uppercase tracking-widest text-muted-foreground"
                  >
                    Full Name (Optional)
                  </label>
                  <input
                    id="full-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Johnathan Doe"
                    className="h-11 w-full rounded-lg border border-border bg-input px-3 font-mono text-body-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/40"
                  />
                </div>

                {notice && !error && <p className="px-1 font-body text-body-sm text-muted-foreground">{notice}</p>}
                {error && <p className="px-1 font-body text-body-sm text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-lg border-b-2 border-secondary-foreground/30 bg-secondary font-display text-body-lg font-bold text-secondary-foreground shadow-xl transition-transform duration-150 active:scale-[0.97] disabled:opacity-60"
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                    bolt
                  </span>
                  {submitting ? "Authorizing…" : "Initialize Session"}
                </button>

                <div className="flex items-center justify-between px-1 pt-2">
                  <a
                    href="#"
                    className="flex items-center gap-1 font-mono text-label-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[14px]">help_center</span>
                    Need assistance?
                  </a>
                  <a href="#" className="font-mono text-label-sm text-muted-foreground transition-colors hover:text-primary">
                    Protocol v4.2.1
                  </a>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>

      {/* Validating toast */}
      <div
        className={`pointer-events-none fixed left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-accent/30 bg-card/90 px-6 py-3 backdrop-blur-md transition-all duration-500 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
        }`}
      >
        <span className="material-symbols-outlined text-accent" style={{ fontVariationSettings: "'FILL' 1" }}>
          check_circle
        </span>
        <span className="font-mono text-label-md text-foreground">Validating terminal credentials…</span>
      </div>

      {/* Institutional footer */}
      <footer className="relative flex h-14 shrink-0 items-center justify-center gap-2 self-stretch overflow-hidden border-t border-border bg-card px-margin-mobile md:h-auto md:justify-between md:border-0 md:bg-transparent md:px-margin-desktop md:pb-margin-desktop">
        <div className="animate-shimmer pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,hsl(var(--secondary)/0.08),transparent)]" />
        <div className="z-10 flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.6)]" />
          <p className="font-mono text-label-sm uppercase tracking-widest text-muted-foreground">
            Institutional Security Gateway Active
          </p>
        </div>
        <div className="z-10 hidden items-center gap-6 md:flex">
          <a href="#" className="font-mono text-label-md text-muted-foreground transition-colors hover:text-primary">
            Privacy Protocol
          </a>
          <a href="#" className="font-mono text-label-md text-muted-foreground transition-colors hover:text-primary">
            Integrity Standards
          </a>
        </div>
      </footer>
    </div>
  );
}
