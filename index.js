const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const config = require('./config');
const logger = require('./lib/logger');
const db = require('./lib/database');
const handler = require('./lib/handler');
const group = require('./commands/group');

// Register every command module.
handler.register(require('./commands/general'));
handler.register(require('./commands/economy'));
handler.register(require('./commands/rpg'));
handler.register(require('./commands/games'));
handler.register(group.commands);
handler.register(require('./commands/fun'));
handler.register(require('./commands/utility'));
handler.register(require('./commands/media'));
handler.register(require('./commands/images'));
handler.register(require('./commands/ai'));

let reconnectAttempts = 0;
const MAX_BACKOFF_MS = 30000;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { qr, connection, lastDisconnect } = update;
        if (qr) {
            console.log('SCAN THIS QR:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                reconnectAttempts++;
                const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_BACKOFF_MS);
                logger.warn(`Connection closed, reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
                setTimeout(startBot, delay);
            } else {
                logger.error('Logged out. Delete auth_info to re-scan a QR code.');
            }
        } else if (connection === 'open') {
            reconnectAttempts = 0;
            logger.info('Connected!');
        }
    });

    // Welcome / goodbye messages
    sock.ev.on('group-participants.update', async (event) => {
        try {
            const settings = group.ensureGroupSettings(event.id);
            if (!settings.welcome) return;
            const meta = await sock.groupMetadata(event.id);
            for (const participantId of event.participants) {
                const name = `@${participantId.split('@')[0]}`;
                if (event.action === 'add') {
                    await sock.sendMessage(event.id, {
                        text: `👋 Welcome ${name} to *${meta.subject}*! Say hi and check !menu to see what I can do.`,
                        mentions: [participantId],
                    });
                } else if (event.action === 'remove') {
                    await sock.sendMessage(event.id, { text: `👋 ${name} has left the group.`, mentions: [participantId] });
                }
            }
        } catch (err) {
            logger.error('group-participants.update handler failed:', err.message);
        }
    });

    // Simple per-user message-rate anti-spam tracker (in-memory).
    const recentMessages = new Map(); // jid -> timestamps[]
    function isSpamming(jid) {
        const now = Date.now();
        const timestamps = (recentMessages.get(jid) || []).filter((t) => now - t < 10000);
        timestamps.push(now);
        recentMessages.set(jid, timestamps);
        return timestamps.length > 8; // >8 messages in 10s
    }

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.message || msg.key.fromMe) return;

        try {
            const chatId = msg.key.remoteJid;
            const from = msg.key.participant || msg.key.remoteJid;
            const isGroup = chatId.endsWith('@g.us');
            const text = (
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                msg.message.videoMessage?.caption ||
                ''
            ).trim();
            if (!text) return;

            const cmd = text.split(/\s+/)[0].toLowerCase();
            const args = text.split(/\s+/).slice(1);
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

            db.ensurePlayer(from);

            let isAdmin = false;
            let isBotAdmin = false;
            let groupMeta = null;
            if (isGroup) {
                groupMeta = await sock.groupMetadata(chatId).catch(() => null);
                if (groupMeta) {
                    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    isAdmin = groupMeta.participants.some((p) => p.id === from && (p.admin === 'admin' || p.admin === 'superadmin'));
                    isBotAdmin = groupMeta.participants.some((p) => p.id === botJid && (p.admin === 'admin' || p.admin === 'superadmin'));
                }
            }

            const ctx = {
                sock,
                msg,
                chatId,
                from,
                text,
                cmd,
                args,
                mentioned,
                isGroup,
                isAdmin,
                isBotAdmin,
                groupMeta,
                reply: (body, mentions) => sock.sendMessage(chatId, { text: body, ...(mentions ? { mentions } : {}) }),
                mentionText: (jid) => `@${jid.split('@')[0]}`,
                downloadQuotedMedia: async () => {
                    const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    const messageToDownload = quoted
                        ? { message: quoted, key: { remoteJid: chatId, id: msg.message.extendedTextMessage.contextInfo.stanzaId, participant: msg.message.extendedTextMessage.contextInfo.participant } }
                        : msg;
                    return downloadMediaMessage(messageToDownload, 'buffer', {});
                },
            };

            // Anti-spam (group only, admins exempt)
            if (isGroup) {
                const settings = group.ensureGroupSettings(chatId);
                if (settings.antispam && !isAdmin && isSpamming(from)) {
                    await ctx.reply(`🚫 ${ctx.mentionText(from)} please slow down.`, [from]);
                    return;
                }
                const moderated = await group.moderateMessage(ctx);
                if (moderated) return;
            }

            if (!cmd.startsWith(config.PREFIX)) return;
            await handler.dispatch(ctx);
        } catch (err) {
            logger.error('Message handler failed:', err);
        }
    });
}

process.on('uncaughtException', (err) => logger.error('Uncaught exception:', err));
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));

startBot();
