const WebSocket = require("ws");

// ─── Config ───────────────────────────────────────────────────────────────────
const CHATROOM_ID = process.env.CHATROOM_ID || "4563828";     // matiasmaderna
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://world.matimaderna.com/api/webhooks/chat";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "9746c722923406d5e043dd9791b9685641a1f1a3101c628c";
const PUSHER_URL = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false";

// ─── State ────────────────────────────────────────────────────────────────────
let ws = null;
let reconnectDelay = 3000;
let reconnectTimer = null;
let pingTimer = null;
let isShuttingDown = false;
let socketId = null;

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── POST al webhook de Next.js ───────────────────────────────────────────────
async function sendToWebhook(username, content, kickUserId, isSubscribed, messageId) {
  try {
    const body = JSON.stringify({
      secret: WEBHOOK_SECRET,
      username,
      content,
      kick_user_id: kickUserId,
      is_subscribed: isSubscribed,
      message_id: messageId,
    });

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      log(`✅ Puntos sumados → ${username}`);
    } else {
      const text = await res.text();
      log(`⚠️  Webhook ${res.status} para ${username}: ${text.slice(0, 100)}`);
    }
  } catch (err) {
    log(`❌ Error POST webhook: ${err.message}`);
  }
}

// ─── Procesar mensajes de Pusher ──────────────────────────────────────────────
function handlePusherMessage(raw) {
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return;
  }

  const { event, data } = envelope;

  // Pusher connection established → guardamos socket_id
  if (event === "pusher:connection_established") {
    try {
      const parsed = JSON.parse(data);
      socketId = parsed.socket_id;
      log(`🔌 Conectado a Pusher. socket_id: ${socketId}`);

      // Suscribirse al chatroom de Matías
      ws.send(
        JSON.stringify({
          event: "pusher:subscribe",
          data: { channel: `chatrooms.${CHATROOM_ID}.v2`, auth: "" },
        })
      );
    } catch {}
    return;
  }

  // Suscripción confirmada
  if (event === "pusher_internal:subscription_succeeded") {
    log(`📡 Suscripto al chatroom ${CHATROOM_ID} — esperando mensajes...`);
    return;
  }

  // Mensaje de chat
  if (
    event === "App\\Events\\ChatMessageEvent" ||
    event === "App\\Events\\ChatMessageSentEvent"
  ) {
    let msgData;
    try {
      msgData = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      return;
    }

    // Estructura del payload de Kick
    const sender =
      msgData?.sender ||        // formato nuevo
      msgData?.user ||          // formato viejo
      null;

    const content =
      msgData?.content ||
      msgData?.message?.message ||
      msgData?.message?.content ||
      "";

    if (!sender?.username || !content) return;

    const isSubscribed = (sender?.identity?.badges || [])
      .some(b => b.type === 'subscriber');

    log(`💬 ${sender.username}: ${content.slice(0, 60)}`);
    const messageId = msgData?.id ?? null;
    sendToWebhook(sender.username, content, sender.id?.toString() || "", isSubscribed, messageId);
  }
}

// ─── Conectar WebSocket ───────────────────────────────────────────────────────
function connect() {
  if (isShuttingDown) return;

  log(`🔄 Conectando a Pusher...`);

  ws = new WebSocket(PUSHER_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      Origin: "https://kick.com",
    },
  });

  ws.on("open", () => {
    reconnectDelay = 3000; // reset backoff

    // Ping cada 30s para mantener la conexión viva
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "pusher:ping", data: {} }));
      }
    }, 30_000);
  });

  ws.on("message", (raw) => handlePusherMessage(raw.toString()));

  ws.on("close", (code, reason) => {
    clearInterval(pingTimer);
    if (isShuttingDown) return;
    log(`🔌 WebSocket cerrado (${code}). Reconectando en ${reconnectDelay / 1000}s...`);
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    log(`❌ WebSocket error: ${err.message}`);
    // El close handler se encarga de reconectar
  });
}

// ─── Reconexión con backoff exponencial ───────────────────────────────────────
function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 60_000); // max 60s
    connect();
  }, reconnectDelay);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  log("🛑 SIGTERM recibido. Cerrando...");
  isShuttingDown = true;
  clearInterval(pingTimer);
  clearTimeout(reconnectTimer);
  if (ws) ws.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  log("🛑 SIGINT recibido. Cerrando...");
  isShuttingDown = true;
  clearInterval(pingTimer);
  clearTimeout(reconnectTimer);
  if (ws) ws.close();
  process.exit(0);
});

// ─── Arrancar ─────────────────────────────────────────────────────────────────
log(`🚀 chatkick worker arrancando`);
log(`   chatroom_id : ${CHATROOM_ID}`);
log(`   webhook_url : ${WEBHOOK_URL}`);
connect();