const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const { timeStamp } = require("console");

const wss = new WebSocket.Server({ port: 8080 });
const clients = new Map();
const MESSAGES_FILE = path.join(__dirname, "messages.json");

// Carrega mensagens já salvas
let messages = [];
if (fs.existsSync(MESSAGES_FILE)) {
    messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8"));
}

function saveMessagesToFile() {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function broadcastUserList() {
    const users = [];
    for (const [, userInfo] of clients) {
        users.push({ userId: userInfo.userId, userName: userInfo.userName });
    }

    const message = JSON.stringify({ type: "userlist", users });

    for (const client of clients.keys()) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

wss.on("connection", (ws) => {
    ws.on("message", (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch {
            console.error("Mensagem inválida");
            return;
        }

        if (msg.type === "join") {
            clients.set(ws, {
                userId: msg.userId,
                userName: msg.userName,
                userColor: msg.userColor
            });

            // Envia histórico para o novo usuário
            ws.send(JSON.stringify({ type: "history", messages: messages.slice(-100) }));

            // Notifica os demais
            const joinMsg = JSON.stringify({
                type: "join",
                userId: msg.userId,
                userName: msg.userName
            });

            for (const client of clients.keys()) {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(joinMsg);
                }
            }

            broadcastUserList();
            return;
        }

        const sender = clients.get(ws);
        if (!sender) return;

        const fullMessage = {
            ...msg,
            userId: sender.userId,
            userName: sender.userName,
            userColor: sender.userColor,
            isPrivate: !!msg.targetId,
        };

        // Salva no array e no arquivo
        messages.push(fullMessage);
        saveMessagesToFile();

        const stringified = JSON.stringify(fullMessage);

        if (msg.targetId) {
            for (const [client, info] of clients) {
                if (
                    info.userId === msg.targetId ||
                    info.userId === sender.userId
                ) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(stringified);
                    }
                }
            }
        } else {
            for (const client of clients.keys()) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(stringified);
                }
            }
        }
    });

    ws.on("close", () => {
        const user = clients.get(ws);
        clients.delete(ws);

        if (user) {
            const leaveMsg = JSON.stringify({
                type: "leave",
                userId: user.userId
            });

            for (const client of clients.keys()) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(leaveMsg);
                }
            }

            broadcastUserList();
        }
    });
});

console.log("Servidor WebSocket rodando na porta 8080");