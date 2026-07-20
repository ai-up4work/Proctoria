// context/SessionContext.tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface Session {
  studentId: string;
  name: string;
  role: "student" | "proctor";
}

interface SessionContextValue {
  session: Session | null;
  login: (studentId: string, name: string, role?: "student" | "proctor") => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEY = "proctoria.session";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  // Restore session on refresh so a student doesn't get bounced mid-exam.
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setSession(JSON.parse(raw));
      } catch {
        /* ignore corrupt value */
      }
    }
  }, []);

  const login = (studentId: string, name: string, role: "student" | "proctor" = "student") => {
    const next: Session = { studentId, name, role };
    setSession(next);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const logout = () => {
    setSession(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  return <SessionContext.Provider value={{ session, login, logout }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}