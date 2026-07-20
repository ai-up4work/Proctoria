// app/proctor/system/page.tsx
"use client";

import { Activity, CheckCircle2, Cpu, Database, Radio, Server } from "lucide-react";

interface SystemComponent {
  name: string;
  description: string;
  status: "operational" | "degraded" | "down";
  uptime: string;
  icon: typeof Server;
}

// Mock data — wire up to real health-check endpoints once available.
const COMPONENTS: SystemComponent[] = [
  { name: "Realtime Socket (Ably)", description: "Powers live proctor ↔ student messaging and status streaming.", status: "operational", uptime: "99.98%", icon: Radio },
  { name: "Gaze Detection Model", description: "In-browser face and gaze inference engine.", status: "operational", uptime: "99.95%", icon: Cpu },
  { name: "Session API", description: "Handles login, session tokens, and role assignment.", status: "operational", uptime: "99.99%", icon: Server },
  { name: "Event Log Storage", description: "Stores flag history and incident reports.", status: "degraded", uptime: "98.41%", icon: Database },
];

const STATUS_STYLES = {
  operational: { label: "Operational", className: "bg-accent/15 text-accent" },
  degraded: { label: "Degraded", className: "bg-secondary/20 text-secondary" },
  down: { label: "Down", className: "bg-destructive/15 text-destructive" },
};

export default function SystemStatusPage() {
  const allOperational = COMPONENTS.every((c) => c.status === "operational");

  return (
    <main className="min-h-screen flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-10 sticky top-0 z-30">
        <div className="flex flex-col">
          <h1 className="font-display text-[length:var(--text-headline-md)] font-bold text-foreground">
            System Status
          </h1>
          <span className="text-muted-foreground text-xs mt-1 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${allOperational ? "bg-accent" : "bg-secondary"}`} />
            {allOperational ? "All systems operational" : "Some systems degraded"}
          </span>
        </div>
      </header>

      <section className="p-10 flex-1">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {COMPONENTS.map((c) => {
            const styles = STATUS_STYLES[c.status];
            const Icon = c.icon;
            return (
              <div
                key={c.name}
                className="bg-card/60 backdrop-blur-md border border-border rounded-xl p-6 flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-foreground">{c.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-2 flex items-center gap-1">
                      <Activity className="h-3 w-3" /> {c.uptime} uptime (30d)
                    </p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase shrink-0 ${styles.className}`}>
                  {styles.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-8 bg-card/60 backdrop-blur-md border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <h3 className="font-bold text-sm text-foreground">Recent Incidents</h3>
          </div>
          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="flex justify-between border-b border-border pb-3">
              <span>Event Log Storage — elevated write latency</span>
              <span className="font-mono">Jul 19, 2026</span>
            </div>
            <div className="flex justify-between">
              <span>Realtime Socket — brief reconnect spike after provider maintenance</span>
              <span className="font-mono">Jul 14, 2026</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}