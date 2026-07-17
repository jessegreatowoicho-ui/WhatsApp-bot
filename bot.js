const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

if (!fs.existsSync('./auth_info_baileys')) fs.mkdirSync('./auth_info_baileys');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if(qr) {
            console.log('Scan this QR:');
            qrcode.generate(qr, {small: true});
        }
        if(connection === 'open') console.log('Bot Connected!');
        if(connection === 'close') startBot();
    });
}

startBot();
