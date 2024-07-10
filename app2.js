const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { handleVoiceNoteDownload } = require('./audioHandler'); // Importar el manejador de notas de voz
const { handleMediaDownload } = require('./mediaHandler'); // Importar el manejador de medios

const GROUPS_FILE = path.join(__dirname, 'groups.json');
let groupIds = {}; // Para almacenar los IDs de los grupos creados

const loadGroupIds = () => {
    if (fs.existsSync(GROUPS_FILE)) {
        const data = fs.readFileSync(GROUPS_FILE);
        groupIds = JSON.parse(data);
        console.log('Group IDs loaded:', groupIds);
    } else {
        console.log('No group IDs found, starting fresh.');
    }
};

const saveGroupIds = () => {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groupIds, null, 2));
    console.log('Group IDs saved:', groupIds);
};

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
            console.log(`QR for ${authDir}:`);
            qrcode.generate(qr, { small: true }); // Imprime el QR en la terminal
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log(`${authDir} connection closed due to`, lastDisconnect.error, ', reconnecting', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(() => initWhatsApp(authDir, port, onMessage), 5000); // Esperar 5 segundos antes de reconectar
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

const sendMessageToGroup = async (sock, groupId, message) => {
    try {
        await sock.sendMessage(groupId, message);
    } catch (error) {
        console.error(`Failed to send message to group ${groupId}:`, error);
    }
};

const sendMessageToClient = async (sock, clientJid, message) => {
    try {
        await sock.sendMessage(clientJid, message);
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
    if (message.stickerMessage) return "[Sticker]";
};

const main = async () => {
    loadGroupIds();

    const sock1 = await initWhatsApp('auth_info1', 4000, async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // Ignora mensajes enviados por WhatsApp 1 mismo

        const sender = msg.key.remoteJid;
        const textMessage = extractMessageText(msg.message);

        if (msg.message.audioMessage) {
            const mp4Path = await handleVoiceNoteDownload(msg);
            console.log(`Audio descargado y convertido a MP4: ${mp4Path}`);

            // Leer el archivo MP4 como buffer
            const audioBuffer = await fs.promises.readFile(mp4Path);

            // Si el mensaje es del cliente, enviarlo al grupo
            if (!sender.endsWith('@g.us')) {
                if (!groupIds[sender]) {
                    const participants = ['5493541634611@s.whatsapp.net']; // WhatsApp2
                    const groupName = sender.split('@')[0]; // Usar el número del cliente como nombre del grupo
                    groupIds[sender] = await createGroup(sock1, groupName, participants);
                    saveGroupIds(); // Guardar cambios después de crear el grupo
                    console.log(`Group ID stored for ${sender}: ${groupIds[sender]}`);
                }
                const groupId = groupIds[sender];
                if (groupId) {
                    await sendMessageToGroup(sock1, groupId, {
                        audio: audioBuffer,
                        mimetype: 'audio/mpeg'
                    }); // Enviar audio al grupo
                    console.log(`Sent audio message to group ${groupId}`);
                } else {
                    console.error(`Failed to create group for ${sender}`);
                }
            }

            // Eliminar el archivo MP4 temporal
            await fs.promises.unlink(mp4Path).catch(error => console.error(`Error deleting file: ${error}`));
        }

        if (msg.message.imageMessage) {
            const imagePath = await handleMediaDownload(msg, 'image');
            console.log(`Imagen descargada: ${imagePath}`);

            const imageBuffer = await fs.promises.readFile(imagePath);

            if (!sender.endsWith('@g.us')) {
                if (!groupIds[sender]) {
                    const participants = ['5493541634611@s.whatsapp.net']; // WhatsApp2
                    const groupName = sender.split('@')[0]; // Usar el número del cliente como nombre del grupo
                    groupIds[sender] = await createGroup(sock1, groupName, participants);
                    saveGroupIds(); // Guardar cambios después de crear el grupo
                    console.log(`Group ID stored for ${sender}: ${groupIds[sender]}`);
                }
                const groupId = groupIds[sender];
                if (groupId) {
                    await sendMessageToGroup(sock1, groupId, {
                        image: imageBuffer,
                        caption: msg.message.imageMessage.caption || '',
                        mimetype: 'image/jpeg'
                    }); // Enviar imagen al grupo
                    console.log(`Sent image message to group ${groupId}`);
                } else {
                    console.error(`Failed to create group for ${sender}`);
                }
            }

            // Eliminar el archivo de imagen temporal
            await fs.promises.unlink(imagePath).catch(error => console.error(`Error deleting file: ${error}`));
        }

        if (msg.message.videoMessage) {
            const videoPath = await handleMediaDownload(msg, 'video');
            console.log(`Video descargado: ${videoPath}`);

            const videoBuffer = await fs.promises.readFile(videoPath);

            if (!sender.endsWith('@g.us')) {
                if (!groupIds[sender]) {
                    const participants = ['5493541634611@s.whatsapp.net']; // WhatsApp2
                    const groupName = sender.split('@')[0]; // Usar el número del cliente como nombre del grupo
                    groupIds[sender] = await createGroup(sock1, groupName, participants);
                    saveGroupIds(); // Guardar cambios después de crear el grupo
                    console.log(`Group ID stored for ${sender}: ${groupIds[sender]}`);
                }
                const groupId = groupIds[sender];
                if (groupId) {
                    await sendMessageToGroup(sock1, groupId, {
                        video: videoBuffer,
                        caption: msg.message.videoMessage.caption || '',
                        mimetype: 'video/mp4'
                    }); // Enviar video al grupo
                    console.log(`Sent video message to group ${groupId}`);
                } else {
                    console.error(`Failed to create group for ${sender}`);
                }
            }

            // Eliminar el archivo de video temporal
            await fs.promises.unlink(videoPath).catch(error => console.error(`Error deleting file: ${error}`));
        }

        if (msg.message.documentMessage) {
            const documentPath = await handleMediaDownload(msg, 'document');
            console.log(`Documento descargado: ${documentPath}`);

            const documentBuffer = await fs.promises.readFile(documentPath);

            if (!sender.endsWith('@g.us')) {
                if (!groupIds[sender]) {
                    const participants = ['5493541634611@s.whatsapp.net']; // WhatsApp2
                    const groupName = sender.split('@')[0]; // Usar el número del cliente como nombre del grupo
                    groupIds[sender] = await createGroup(sock1, groupName, participants);
                    saveGroupIds(); // Guardar cambios después de crear el grupo
                    console.log(`Group ID stored for ${sender}: ${groupIds[sender]}`);
                }
                const groupId = groupIds[sender];
                if (groupId) {
                    await sendMessageToGroup(sock1, groupId, {
                        document: documentBuffer,
                        mimetype: msg.message.documentMessage.mimetype,
                        fileName: msg.message.documentMessage.fileName || 'document'
                    }); // Enviar documento al grupo
                    console.log(`Sent document message to group ${groupId}`);
                } else {
                    console.error(`Failed to create group for ${sender}`);
                }
            }

            // Eliminar el archivo de documento temporal
            await fs.promises.unlink(documentPath).catch(error => console.error(`Error deleting file: ${error}`));
        }

        if (textMessage && !sender.endsWith('@g.us')) { // Solo procesa mensajes de clientes, no de grupos
            console.log(`Received message from ${sender}: ${textMessage}`);

            if (!groupIds[sender]) {
                const participants = ['5493541634611@s.whatsapp.net']; // WhatsApp2
                const groupName = sender.split('@')[0]; // Usar el número del cliente como nombre del grupo
                groupIds[sender] = await createGroup(sock1, groupName, participants);
                saveGroupIds(); // Guardar cambios después de crear el grupo
                console.log(`Group ID stored for ${sender}: ${groupIds[sender]}`);
            }
            const groupId = groupIds[sender];
            if (groupId) {
                await sendMessageToGroup(sock1, groupId, { text: textMessage }); // Enviar mensaje al grupo
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

        const sender = msg.key.remoteJid;
        const textMessage = extractMessageText(msg.message);

        if (msg.message.audioMessage) {
            const mp4Path = await handleVoiceNoteDownload(msg);
            console.log(`Audio descargado y convertido a MP4: ${mp4Path}`);

            // Leer el archivo MP4 como buffer
            const audioBuffer = await fs.promises.readFile(mp4Path);

            // Si el mensaje es del grupo, enviarlo al cliente
            if (sender.endsWith('@g.us') && msg.key.participant === '5493541634611@s.whatsapp.net') {
                const clientJid = Object.keys(groupIds).find(key => groupIds[key] === sender);
                if (clientJid) {
                    await sendMessageToClient(sock1, clientJid, {
                        audio: audioBuffer,
                        mimetype: 'audio/mpeg'
                    }); // Enviar audio al cliente
                    console.log(`Sent audio message to client ${clientJid}`);
                } else {
                    console.error(`No client found for group ${sender}`);
                }
            }

            // Eliminar el archivo MP4 temporal
            await fs.promises.unlink(mp4Path).catch(error => console.error(`Error deleting file: ${error}`));
        }

        if (msg.message.imageMessage) {
            const imagePath = await handleMediaDownload(msg, 'image');
            console.log(`Imagen descargada: ${imagePath}`);

            const imageBuffer = await fs.promises.readFile(imagePath);

            if (sender.endsWith('@g.us') && msg.key.participant === '5493541634611@s.whatsapp.net') {
                const clientJid = Object.keys(groupIds).find(key => groupIds[key] === sender);
                if (clientJid) {
                    await sendMessageToClient(sock1, clientJid, {
                        image: imageBuffer,
                        caption: msg.message.imageMessage.caption || '',
                        mimetype: 'image/jpeg'
                    }); // Enviar imagen al cliente
                    console.log(`Sent image message to client ${clientJid}`);
                } else {
                    console.error(`No client found for group ${sender}`);
                }
            }

            // Eliminar el archivo de imagen temporal
            await fs.promises.unlink(imagePath).catch(error => console.error(`Error deleting file: ${error}`));
        }

        if (msg.message.videoMessage) {
            const videoPath = await handleMediaDownload(msg, 'video');
            console.log(`Video descargado: ${videoPath}`);

            const videoBuffer = await fs.promises.readFile(videoPath);

            if (sender.endsWith('@g.us') && msg.key.participant === '5493541634611@s.whatsapp.net') {
                const clientJid = Object.keys(groupIds).find(key => groupIds[key] === sender);
                if (clientJid) {
                    await sendMessageToClient(sock1, clientJid, {
                        video: videoBuffer,
                        caption: msg.message.videoMessage.caption || '',
                        mimetype: 'video/mp4'
                    }); // Enviar video al cliente
                    console.log(`Sent video message to client ${clientJid}`);
                } else {
                    console.error(`No client found for group ${sender}`);
                }
            }

            // Eliminar el archivo de video temporal
            await fs.promises.unlink(videoPath).catch(error => console.error(`Error deleting file: ${error}`));
        }

        if (msg.message.documentMessage) {
            const documentPath = await handleMediaDownload(msg, 'document');
            console.log(`Documento descargado: ${documentPath}`);

            const documentBuffer = await fs.promises.readFile(documentPath);

            if (sender.endsWith('@g.us') && msg.key.participant === '5493541634611@s.whatsapp.net') {
                const clientJid = Object.keys(groupIds).find(key => groupIds[key] === sender);
                if (clientJid) {
                    await sendMessageToClient(sock1, clientJid, {
                        document: documentBuffer,
                        mimetype: msg.message.documentMessage.mimetype,
                        fileName: msg.message.documentMessage.fileName || 'document'
                    }); // Enviar documento al cliente
                    console.log(`Sent document message to client ${clientJid}`);
                } else {
                    console.error(`No client found for group ${sender}`);
                }
            }

            // Eliminar el archivo de documento temporal
            await fs.promises.unlink(documentPath).catch(error => console.error(`Error deleting file: ${error}`));
        }

        if (textMessage && sender.endsWith('@g.us') && msg.key.participant === '5493541634611@s.whatsapp.net') {
            console.log(`Received message in group ${sender}: ${textMessage}`);
            const clientJid = Object.keys(groupIds).find(key => groupIds[key] === sender);
            if (clientJid) {
                await sendMessageToClient(sock1, clientJid, { text: textMessage }); // Enviar respuesta al cliente
                console.log(`Sent message to client ${clientJid}: ${textMessage}`);
            } else {
                console.error(`No client found for group ${sender}`);
            }
        }
    });
};

main();





