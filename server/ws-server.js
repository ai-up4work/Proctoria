// server/ws-server.js
// Minimal proctoring WebSocket hub. Run standalone: `node server/ws-server.js`
// (separate from the Next.js app — Next's default server doesn't host raw ws
// connections without a custom server setup, so keeping this as its own
// small process is the simplest reliable option.)
//
// Protocol (all messages are JSON):
//
// Client -> server:
//   { type: "register", role: "student" | "proctor", studentId?, name? }
//   { type: "status",   studentId, result, metrics, flagCount, awayTime, sessionTime }
//   { type: "flag",     studentId, message, timestamp }
//   { type: "alert",    studentId, message }   // proctor -> a specific student
//
// Server -> proctor clients:
//   { type: "roster",  students: [{studentId, name, connected}] }
//   { type: "status",  studentId, ... }        // relayed
//   { type: "flag",    studentId, ... }        // relayed
//   { type: "disconnected", studentId }
//
// Server -> a specific student client:
//   { type: "alert", message, timestamp }

const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

/** @type {Map<string, {ws: import('ws').WebSocket, name?: string, lastStatus?: any}>} */
const students = new Map();
/** @type {Set<import('ws').WebSocket>} */
const proctors = new Set();

function broadcastToProctors(msg) {
  const data = JSON.stringify(msg);
  for (const p of proctors) {
    if (p.readyState === p.OPEN) p.send(data);
  }
}

function sendRoster() {
  broadcastToProctors({
    type: "roster",
    students: [...students.entries()].map(([studentId, s]) => ({
      studentId,
      name: s.name,
      connected: s.ws.readyState === s.ws.OPEN,
      lastStatus: s.lastStatus ?? null,
    })),
  });
}

wss.on("connection", (ws) => {
  let role = null;
  let studentId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "register": {
        role = msg.role;
        if (role === "student") {
          studentId = String(msg.studentId);
          students.set(studentId, { ws, name: msg.name });
          sendRoster();
        } else if (role === "proctor") {
          proctors.add(ws);
          sendRoster();
        }
        break;
      }

      case "status": {
        if (role !== "student" || !studentId) return;
        const entry = students.get(studentId);
        if (entry) entry.lastStatus = msg;
        broadcastToProctors({ type: "status", studentId, ...msg });
        break;
      }

      case "flag": {
        if (role !== "student" || !studentId) return;
        broadcastToProctors({ type: "flag", studentId, message: msg.message, timestamp: msg.timestamp });
        break;
      }

      case "alert": {
        // Only proctors may send alerts, and only to the named student.
        if (role !== "proctor") return;
        const target = students.get(String(msg.studentId));
        if (target && target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({ type: "alert", message: msg.message, timestamp: Date.now() }));
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    if (role === "student" && studentId) {
      students.delete(studentId);
      broadcastToProctors({ type: "disconnected", studentId });
      sendRoster();
    } else if (role === "proctor") {
      proctors.delete(ws);
    }
  });
});

console.log(`Proctoring WS hub listening on ws://localhost:${PORT}`);