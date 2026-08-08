# chatkick

Worker de Node.js que escucha el chat en vivo de un canal de **Kick.com** vía WebSocket (Pusher) y reenvía cada mensaje a un webhook externo para acreditar puntos (MDR Points).

## Cómo funciona

```
Kick.com (Pusher WS)  →  chatkick worker  →  Webhook Next.js  →  Base de datos
```

1. Se conecta al servidor Pusher de Kick (`wss://ws-us2.pusher.com`).
2. Se suscribe al canal del chatroom configurado.
3. Por cada mensaje de chat recibido, hace un `POST` al webhook con `username`, `content` y `kick_user_id`.
4. El webhook acredita puntos al usuario en el sistema MDR Points.

Incluye reconexión automática con backoff exponencial (máx. 60 s) y ping cada 30 s para mantener la conexión viva.

## Variables de entorno

| Variable         | Default                                         | Descripción                          |
|------------------|-------------------------------------------------|--------------------------------------|
| `CHATROOM_ID`    | `4563828`                                       | ID del chatroom de Kick a escuchar   |
| `WEBHOOK_URL`    | `https://world.matimaderna.com/api/webhooks/chat` | URL del endpoint que acredita puntos |
| `WEBHOOK_SECRET` | *(ver código)*                                  | Secret compartido con el webhook     |

## Correr con Docker

### Build

```bash
docker build -t chatkick .
```

### Run

```bash
docker run -d \
  --name chatkick \
  --restart unless-stopped \
  -e CHATROOM_ID=4563828 \
  -e WEBHOOK_URL=https://world.matimaderna.com/api/webhooks/chat \
  -e WEBHOOK_SECRET=tu_secret \
  chatkick
```

### Logs

```bash
docker logs -f chatkick
```

## Correr sin Docker

Requiere Node.js >= 18.

```bash
npm install
node index.js
```

## Estructura

```
.
├── index.js       # Worker principal
├── package.json
└── Dockerfile
```
