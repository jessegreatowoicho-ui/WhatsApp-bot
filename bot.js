const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const DATA_FILE = 'bot_data.json';
let data = { wallets: {}, players: {} };

if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE));
}
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const ALL_CARDS = [
    {name: "Pikachu", hp: 60, attack: "Thunder Shock", dmg: 20, type: "pokemon"},
    {name: "Charizard", hp: 120, attack: "Flamethrower", dmg: 50, type: "pokemon"},
    {name: "Blastoise", hp: 100, attack: "Water Gun", dmg: 40, type: "pokemon"},
    {name: "Electric Energy", type: "energy"},
    {name: "Fire Energy", type: "energy"},
    {name: "Water Energy", type: "energy"},
    {name: "Potion", type: "trainer", effect: "Heal 20"}
];

let battles = {};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({ auth: state });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ qr, connection, lastDisconnect }) => {
        if (qr) {
            console.log('SCAN THIS QR:');
            qrcode.generate(qr, {small: true})
        }
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode!== DisconnectReason.loggedOut
            if(shouldReconnect) startBot()
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const chatId = msg.key.remoteJid;
        const from = msg.key.participant || msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const cmd = text.toLowerCase();

        if (!data.wallets[from]) data.wallets[from] = 1000;
        if (!data.players[from]) data.players[from] = {collection: []};

        if (cmd === '!menu') {
            sock.sendMessage(chatId, { text: `*BOT BOY* 🤖\n\n*CASINO* 🎰\n!balance!daily!flip [amount] [heads/tails]!slots [amount]!top\n*POKEMON* 🃏\n!start [pikachu/charizard/blastoise]!hand!play [1-7]!attack!battle @user!open!collection` });
        }

        if (cmd === '!balance') {
            sock.sendMessage(chatId, { text: `💰 @${from.split('@')[0]} coins: ${data.wallets[from].toLocaleString()} 🪙`, mentions: [from] });
        }

        if (cmd === '!daily') {
            let lastDaily = data.wallets[from + '_daily'] || 0;
            const now = Date.now();
            if (now - lastDaily < 86400000) {
                const hoursLeft = Math.ceil((86400000 - (now - lastDaily)) / 3600000);
                return sock.sendMessage(chatId, { text: `@${from.split('@')[0]} Come back in ${hoursLeft}h`, mentions: [from] });
            }
            data.wallets[from] += 500;
            data.wallets[from + '_daily'] = now;
            saveData();
            sock.sendMessage(chatId, { text: `@${from.split('@')[0]} Claimed +500 coins! New: ${data.wallets[from].toLocaleString()}`, mentions: [from] });
        }

        if (cmd.startsWith('!flip ')) {
            const parts = text.split(' ');
            const bet = parseInt(parts[1]); const choice = parts[2]?.toLowerCase();
            if (bet >
