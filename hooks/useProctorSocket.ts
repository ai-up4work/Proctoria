// hooks/useProctorSocket.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Ably from "ably";
import { FlagCategory } from "@/lib/gaze";

// Single shared channel for status/flag traffic between all students and
// any proctor. Alerts go over per-student channels instead (see below) so
// Ably's own channel subscription model enforces "only this student sees
// this alert" — no server-side routing logic needed.
const ROOM_CHANNEL = "proctoring-room";
const alertChannelName = (studentId: string) => `alert-${studentId}`;

export interface RosterEntry {
  studentId: string;
  name?: string;
  connected: boolean;
  lastStatus: any;
}

export interface FlagEvent {
  studentId: string;
  message: string;
  timestamp: number;
  category: FlagCategory;
}

/**
 * clientId should be the logged-in user's stable id (studentId for
 * students, or any unique id for a proctor). The Ably client isn't created
 * until clientId is known, since the auth token is minted for that id.
 */
export function useProctorSocket(clientId: string | null) {
  const clientRef = useRef<Ably.Realtime | null>(null);
  const roomRef = useRef<Ably.RealtimeChannel | null>(null);

  const [connected, setConnected] = useState(false);
  const [roster, setRoster] = useState<Map<string, RosterEntry>>(new Map());
  const [events, setEvents] = useState<FlagEvent[]>([]);
  const [alert, setAlert] = useState<{ message: string; timestamp: number } | null>(null);

  const [connectionError, setConnectionError] = useState<string | null>(null);

  // One Ably connection per mounted page, torn down on unmount / clientId change.
  useEffect(() => {
    if (!clientId) return;

    const client = new Ably.Realtime({
      authUrl: `/api/ably-token?clientId=${encodeURIComponent(clientId)}`,
      clientId,
    });
    clientRef.current = client;

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
    };
  }, [clientId]);

  // Guards against re-subscribing every time `connected` flips true->false->true
  // on a reconnect, which previously caused duplicate event/flag/alert delivery.
  const studentRegisteredRef = useRef(false);
  const proctorRegisteredRef = useRef(false);

  const registerStudent = useCallback(
    (name?: string) => {
      const client = clientRef.current;
      if (!client || !clientId) return;
      if (studentRegisteredRef.current) return;
      studentRegisteredRef.current = true;

      const room = client.channels.get(ROOM_CHANNEL);
      roomRef.current = room;
      room.presence.enter({ role: "student", name });

      // Subscribe only to alerts addressed to this student's own channel.
      const alertChannel = client.channels.get(alertChannelName(clientId));
      alertChannel.subscribe("alert", (msg) => {
        setAlert({ message: msg.data.message, timestamp: msg.timestamp ?? Date.now() });
      });
    },
    [clientId]
  );

  const registerProctor = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    if (proctorRegisteredRef.current) return;
    proctorRegisteredRef.current = true;

    const room = client.channels.get(ROOM_CHANNEL);
    roomRef.current = room;
    room.presence.enter({ role: "proctor" });

    async function refreshRosterFromPresence() {
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
          });
        }
        for (const [id, entry] of next) {
          if (!presentIds.has(id)) next.set(id, { ...entry, connected: false });
        }
        return next;
      });
    }

    room.presence.subscribe(["enter", "leave", "update"], refreshRosterFromPresence);
    refreshRosterFromPresence();

    room.subscribe("status", (msg) => {
      const { studentId, ...status } = msg.data;
      setRoster((prev) => {
        const next = new Map(prev);
        const existing = next.get(studentId);
        next.set(studentId, {
          studentId,
          name: existing?.name,
          connected: existing?.connected ?? true,
          lastStatus: status,
        });
        return next;
      });
    });

    room.subscribe("flag", (msg) => {
      const { studentId, message, timestamp, category } = msg.data as FlagEvent;
      setEvents((prev) => [{ studentId, message, timestamp, category }, ...prev].slice(0, 200));
    });
  }, []);

  const sendStatus = useCallback((studentId: string, status: object) => {
    roomRef.current?.publish("status", { studentId, ...status });
  }, []);

  const sendFlag = useCallback(
    (studentId: string, message: string, timestamp: number, category: FlagCategory) => {
      roomRef.current?.publish("flag", { studentId, message, timestamp, category });
    },
    []
  );

  const sendAlert = useCallback((studentId: string, message: string) => {
    const client = clientRef.current;
    if (!client) return;
    client.channels.get(alertChannelName(studentId)).publish("alert", { message });
  }, []);

  const clearAlert = useCallback(() => setAlert(null), []);

  return {
    connected,
    connectionError,
    roster: Array.from(roster.values()),
    events,
    alert,
    clearAlert,
    registerStudent,
    registerProctor,
    sendStatus,
    sendFlag,
    sendAlert,
  };
}