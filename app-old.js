const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const groupIds = {}; // Para almacenar los IDs de los grupos creados

const initWhatsApp = async (authDir, port, onMessage) => {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true }); // Imprime el QR en la terminal
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log(`${authDir} connection closed due to`, lastDisconnect.error, ', reconnecting', shouldReconnect);
            if (shouldReconnect) {
                initWhatsApp(authDir, port, onMessage);
            }
        } else if (connection === 'open') {
            console.log(`${authDir} connected`);
        }
    });

    sock.ev.on('messages.upsert', onMessage);

    return sock;
};

const createGroup = async (sock, groupName, participants) => {
    console.log(`Creating group: ${groupName} with participants: ${participants}`);
    try {
        const response = await sock.groupCreate(groupName, participants);
        console.log(`Group created with ID: ${response.id}`);
        return response.id;
    } catch (error) {
        console.error(`Failed to create group:`, error);
        return null;
    }
};

const sendMessageToGroup = async (sock, groupId, text) => {
    try {
        await sock.sendMessage(groupId, { text });
    } catch (error) {
        console.error(`Failed to send message to group ${groupId}:`, error);
    }
};

const sendMessageToClient = async (sock, clientJid, text) => {
    try {
        await sock.sendMessage(clientJid, { text });
    } catch (error) {
        console.error(`Failed to send message to client ${clientJid}:`, error);
    }
};

const extractMessageText = (message) => {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage) return message.extendedTextMessage.text;
    if (message.imageMessage) return message.imageMessage.caption;
    if (message.videoMessage) return message.videoMessage.caption;
    if (message.documentMessage) return message.documentMessage.caption;
    if (message.audioMessage) return "[Audio]";
    if (message.stickerMessage) return "[Sticker]";
    return "[Unknown Type]";
};

const main = async () => {
    const sock1 = await initWhatsApp('auth_info1', 4000, async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // Ignora mensajes enviados por WhatsApp 1 mismo

        const textMessage = extractMessageText(msg.message);
        const sender = msg.key.remoteJid;

        if (textMessage && !sender.endsWith('@g.us')) { // Solo procesa mensajes de clientes, no de grupos
            console.log(`Received message from ${sender}: ${textMessage}`);

            if (!groupIds[sender]) {
                const participants = ['']; // WhatsApp2
                const groupName = sender.split('@')[0]; // Usar el número del cliente como nombre del grupo
                groupIds[sender] = await createGroup(sock1, groupName, participants);
                console.log(`Group ID stored for ${sender}: ${groupIds[sender]}`);
            }
            const groupId = groupIds[sender];
            if (groupId) {
                await sendMessageToGroup(sock1, groupId, textMessage); // Enviar mensaje al grupo
                console.log(`Sent message to group ${groupId}`);
            } else {
                console.error(`Failed to create group for ${sender}`);
            }
        }
    });

    const sock2 = await initWhatsApp('auth_info2', 5000, async (m) => {
        const msg = m.messages[0];
        console.log('Message upsert in sock2:', JSON.stringify(m, null, 2)); // Agregar registro de depuración

        if (!msg.message) return; // Asegúrate de que hay un mensaje

        const textMessage = extractMessageText(msg.message);
        const sender = msg.key.remoteJid;

        // Verificar si el mensaje es del grupo y enviado por WhatsApp2
        if (textMessage && sender.endsWith('@g.us') && msg.key.participant === '') {
            console.log(`Received message in group ${sender}: ${textMessage}`);
            const clientJid = Object.keys(groupIds).find(key => groupIds[key] === sender);
            if (clientJid) {
                await sendMessageToClient(sock1, clientJid, textMessage); // Enviar respuesta al cliente
                console.log(`Sent message to client ${clientJid}: ${textMessage}`);
            } else {
                console.error(`No client found for group ${sender}`);
            }
        }
    });
};

main();





















