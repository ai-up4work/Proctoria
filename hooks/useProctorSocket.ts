// hooks/useProctorSocket.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Ably from "ably";
import { FLAG_CATEGORY_META, FlagCategory, isFlagCategory } from "@/lib/gaze";

// Single shared channel for status/flag traffic between all students and
// any proctor. Alerts and control nudges go over per-student channels
// instead, so Ably's own capability model enforces "only this student
// receives this" — no server-side routing logic needed.
const ROOM_CHANNEL = "proctoring-room";
const alertChannelName = (studentId: string) => `alert-${studentId}`;

const MAX_MESSAGE_LENGTH = 1000;

export interface RosterEntry {
  studentId: string;
  name?: string;
  connected: boolean;
  lastStatus: any;
  // Authoritative count of every flag this student has generated, from
  // *any* source. Maintained off the "flag" channel rather than read out of
  // lastStatus.flagCount, which only reflects the gaze hook's own counter.
  flagCount: number;
}

export interface FlagEvent {
  studentId: string;
  message: string;
  timestamp: number;
  category: FlagCategory;
}

/**
 * clientId is only used as a "session exists" gate and to name this
 * student's alert channel. The real identity is bound server-side: the
 * Ably token is minted from the signed session cookie by
 * /api/ably-token, so the id a client claims here can't change who it is.
 */
export function useProctorSocket(clientId: string | null) {
  const clientRef = useRef<Ably.Realtime | null>(null);
  const roomRef = useRef<Ably.RealtimeChannel | null>(null);

  // Guards against re-subscribing every time `connected` flips true->false->true
  // on a reconnect, which would cause duplicate event/flag/alert delivery.
  const studentRegisteredRef = useRef(false);
  const proctorRegisteredRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [roster, setRoster] = useState<Map<string, RosterEntry>>(new Map());
  const [events, setEvents] = useState<FlagEvent[]>([]);
  const [alert, setAlert] = useState<{ message: string; timestamp: number } | null>(null);
  // Bumped whenever the proctor nudges this student to re-read its exam state.
  const [controlTick, setControlTick] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  // Channel-level problems (missing capability, attach failure, publish denied).
  // The connection can be healthy while a channel is not, which otherwise
  // looks like "connected but nobody shows up".
  const [channelError, setChannelError] = useState<string | null>(null);

  const reportChannelError = useCallback((where: string, err: unknown) => {
    const msg = (err as { message?: string } | null)?.message ?? String(err);
    console.error(`[proctor-socket] ${where}:`, err);
    setChannelError(`${where}: ${msg}`);
  }, []);

  // One Ably connection per mounted page, torn down on unmount / clientId change.
  useEffect(() => {
    if (!clientId) return;

    const client = new Ably.Realtime({ authUrl: "/api/ably-token" });
    clientRef.current = client;
    setChannelError(null);

    client.connection.on("connected", () => {
      setConnected(true);
      setConnectionError(null);
    });
    client.connection.on("disconnected", () => setConnected(false));
    client.connection.on("suspended", () => setConnected(false));
    client.connection.on("failed", (stateChange) => {
      setConnected(false);
      const reason = stateChange.reason?.message || "Ably connection failed";
      setConnectionError(reason);
      console.error("Ably connection failed:", stateChange.reason);
    });

    return () => {
      client.close();
      clientRef.current = null;
      roomRef.current = null;
      // Reset so a remount (dev StrictMode, clientId change) registers again.
      studentRegisteredRef.current = false;
      proctorRegisteredRef.current = false;
      setConnected(false);
    };
  }, [clientId]);

  /** Surface channel failures (usually a missing capability in the token). */
  const watchChannel = useCallback(
    (channel: Ably.RealtimeChannel, label: string) => {
      channel.on("failed", (change) => reportChannelError(`${label} channel failed`, change.reason));
    },
    [reportChannelError]
  );

  const registerStudent = useCallback(
    (name?: string) => {
      const client = clientRef.current;
      if (!client || !clientId) return;
      if (studentRegisteredRef.current) return;
      studentRegisteredRef.current = true;

      const room = client.channels.get(ROOM_CHANNEL);
      roomRef.current = room;
      watchChannel(room, "room");
      // Needs the "presence" capability on proctoring-room.
      room.presence.enter({ role: "student", name }).catch((err) => reportChannelError("presence.enter", err));

      // Subscribe only to messages addressed to this student's own channel.
      const alertChannel = client.channels.get(alertChannelName(clientId));
      watchChannel(alertChannel, "alert");
      alertChannel.subscribe("alert", (msg) => {
        setAlert({ message: String(msg.data?.message ?? ""), timestamp: msg.timestamp ?? Date.now() });
      });
      // The payload is intentionally meaningless: it is only a nudge, and the
      // student re-reads its lock state from the server rather than trusting it.
      alertChannel.subscribe("control", () => setControlTick((t) => t + 1));
    },
    [clientId, watchChannel, reportChannelError]
  );

  const registerProctor = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    if (proctorRegisteredRef.current) return;
    proctorRegisteredRef.current = true;

    const room = client.channels.get(ROOM_CHANNEL);
    roomRef.current = room;
    watchChannel(room, "room");
    // Needs the "presence" capability on proctoring-room.
    room.presence.enter({ role: "proctor" }).catch((err) => reportChannelError("presence.enter", err));

    async function refreshRosterFromPresence() {
      try {
        const members = await room.presence.get();
        const presentStudents = members.filter((m) => m.data?.role === "student");
        setRoster((prev) => {
          const next = new Map(prev);
          const presentIds = new Set(presentStudents.map((m) => m.clientId));

          for (const m of presentStudents) {
            const existing = next.get(m.clientId);
            next.set(m.clientId, {
              studentId: m.clientId,
              name: m.data?.name,
              connected: true,
              lastStatus: existing?.lastStatus ?? null,
              flagCount: existing?.flagCount ?? 0,
            });
          }
          for (const [id, entry] of next) {
            if (!presentIds.has(id)) next.set(id, { ...entry, connected: false });
          }
          return next;
        });
      } catch (err) {
        reportChannelError("presence.get", err);
      }
    }

    room.presence.subscribe(["enter", "leave", "update"], refreshRosterFromPresence);
    refreshRosterFromPresence();

    // Needs the "subscribe" capability on proctoring-room.
    room.subscribe("status", (msg) => {
      // Ably stamps the verified publisher on every message. Never trust a
      // studentId written inside the body: a student could frame someone else.
      const studentId = msg.clientId;
      if (!studentId) return;
      const { studentId: _ignored, ...status } = (msg.data ?? {}) as Record<string, any>;
      setRoster((prev) => {
        const next = new Map(prev);
        const existing = next.get(studentId);
        next.set(studentId, {
          studentId,
          name: existing?.name,
          connected: existing?.connected ?? true,
          lastStatus: status,
          // Status updates must never touch the flag count.
          flagCount: existing?.flagCount ?? 0,
        });
        return next;
      });
    });

    room.subscribe("flag", (msg) => {
      const studentId = msg.clientId;
      if (!studentId) return;
      const data = (msg.data ?? {}) as Partial<FlagEvent>;
      // Sanitize: an unknown category would crash the dashboard's meta lookup.
      const category: FlagCategory = isFlagCategory(data.category) ? data.category : "system";
      const message = String(data.message ?? "").slice(0, MAX_MESSAGE_LENGTH);
      const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now();

      setEvents((prev) => [{ studentId, message, timestamp, category }, ...prev].slice(0, 200));
      setRoster((prev) => {
        const next = new Map(prev);
        const existing = next.get(studentId);
        next.set(studentId, {
          studentId,
          name: existing?.name,
          connected: existing?.connected ?? true,
          lastStatus: existing?.lastStatus ?? null,
          flagCount: (existing?.flagCount ?? 0) + 1,
        });
        return next;
      });
    });
  }, [watchChannel, reportChannelError]);

  // The studentId parameters are kept for call-site compatibility; the
  // receiving side ignores them and uses the verified msg.clientId instead.
  // Needs the "publish" capability on proctoring-room.
  const sendStatus = useCallback(
    (studentId: string, status: object) => {
      roomRef.current
        ?.publish("status", { studentId, ...status })
        .catch((err) => reportChannelError("publish status", err));
    },
    [reportChannelError]
  );

  const sendFlag = useCallback(
    (studentId: string, message: string, timestamp: number, category: FlagCategory) => {
      if (!(category in FLAG_CATEGORY_META)) category = "system";
      roomRef.current
        ?.publish("flag", { studentId, message, timestamp, category })
        .catch((err) => reportChannelError("publish flag", err));
    },
    [reportChannelError]
  );

  // Proctor needs "publish" on alert-* for these two.
  const sendAlert = useCallback(
    (studentId: string, message: string) => {
      const client = clientRef.current;
      if (!client) return;
      client.channels
        .get(alertChannelName(studentId))
        .publish("alert", { message })
        .catch((err) => reportChannelError("publish alert", err));
    },
    [reportChannelError]
  );

  /** Proctor -> student nudge: "re-read your exam state from the server now". */
  const sendControl = useCallback(
    (studentId: string) => {
      const client = clientRef.current;
      if (!client) return;
      client.channels
        .get(alertChannelName(studentId))
        .publish("control", { action: "sync" })
        .catch((err) => reportChannelError("publish control", err));
    },
    [reportChannelError]
  );

  const clearAlert = useCallback(() => setAlert(null), []);

  return {
    connected,
    connectionError,
    channelError,
    roster: Array.from(roster.values()),
    events,
    alert,
    clearAlert,
    controlTick,
    registerStudent,
    registerProctor,
    sendStatus,
    sendFlag,
    sendAlert,
    sendControl,
  };
}