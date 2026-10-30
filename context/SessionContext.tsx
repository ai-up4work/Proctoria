// context/SessionContext.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

export interface Session {
  studentId: string;
  name: string;
  role: "student" | "proctor";
}

interface SessionContextValue {
  session: Session | null;
  /** True until the first server check (/api/me) has finished. Consumers that
   *  redirect based on session presence should wait for this to be false. */
  initializing: boolean;
  /** Call AFTER POST /api/login succeeded. Stores the display name and
   *  re-verifies against the server cookie. Returns the verified session. */
  login: (studentId: string, name: string, role?: "student" | "proctor") => Promise<Session | null>;
  /** Clears the server cookie and the client state. */
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Only the *display name* is kept client-side. Identity and role always come
// from the signed server cookie via /api/me, so this can never grant access.
const NAME_KEY = "proctoria.displayName";

async function fetchMe(): Promise<{ id: string; role: "student" | "proctor" } | null> {
  try {
    const res = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function readName(id: string): string {
  try {
    const raw = sessionStorage.getItem(NAME_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; name: string };
      if (parsed.id === id && parsed.name) return parsed.name;
    }
  } catch {
    /* ignore corrupt value */
  }
  return id;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  // On every load, ask the server who we are. The cookie is the source of
  // truth; a stale client-side "login" can no longer outlive it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetchMe();
      if (cancelled) return;
      if (me) {
        setSession({ studentId: me.id, name: readName(me.id), role: me.role });
      } else {
        sessionStorage.removeItem(NAME_KEY);
        setSession(null);
      }
      setInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (studentId: string, name: string, role: "student" | "proctor" = "student") => {
      try {
        sessionStorage.setItem(NAME_KEY, JSON.stringify({ id: studentId, name }));
      } catch {
        /* storage unavailable: falls back to showing the id */
      }
      const me = await fetchMe();
      if (!me) {
        // /api/login was not called, or its cookie did not stick.
        setSession(null);
        return null;
      }
      const next: Session = { studentId: me.id, name, role: me.role ?? role };
      setSession(next);
      return next;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* cookie expires on its own; client state is cleared below */
    }
    sessionStorage.removeItem(NAME_KEY);
    setSession(null);
  }, []);

  return (
    <SessionContext.Provider value={{ session, initializing, login, logout }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
