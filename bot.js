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
            if (bet > data.wallets[from]) return sock.sendMessage(chatId, { text: "Not enough coins!" });
            data.wallets[from] -= bet;
            const result = Math.random() < 0.5? 'heads' : 'tails';
            if (choice === result) data.wallets[from] += bet * 2;
            saveData();
            sock.sendMessage(chatId, { text: `🪙 ${result.toUpperCase()}! ${choice===result?`Won ${bet}`:`Lost ${bet}`} | Balance: ${data.wallets[from].toLocaleString()}`, mentions: [from] });
        }

        if (cmd.startsWith('!slots ')) {
            const bet = parseInt(text.split(' ')[1]);
            if (bet > data.wallets[from]) return sock.sendMessage(chatId, { text: "Not enough coins!" });
            data.wallets[from] -= bet;
            const emojis = ['🍒','🍋','7','⭐','🔔'];
            const spin = Array(3).fill(0).map(()=>emojis[Math.floor(Math.random()*5)]);
            let win = spin[0]===spin[1] && spin[1]===spin[2]? bet*10 : spin[0]===spin[1]||spin[1]===spin[2]? bet*2 : 0;
            data.wallets[from] += win;
            saveData();
            sock.sendMessage(chatId, { text: `🎰 ${spin.join(' ')} | ${win>0?`Won ${win}`:`Lost ${bet}`} | Balance: ${data.wallets[from].toLocaleString()}`, mentions: [from] });
        }

        if (cmd === '!top') {
            const sorted = Object.keys(data.wallets).filter(k=>!k.includes('_daily')).sort((a,b)=>data.wallets[b]-data.wallets[a]).slice(0,5);
            let msg = "🏆 TOP 5 🏆\n";
            sorted.forEach((u,i)=> msg += `${i+1}. @${u.split('@')[0]}: ${data.wallets[u].toLocaleString()}\n`);
            sock.sendMessage(chatId, { text: msg, mentions: sorted });
        }

        function createDeck(starter) {
            let deck = [ALL_CARDS.find(c=>c.name===starter)];
            deck.push(...ALL_CARDS.filter(c=>c.type==="energy").slice(0,8));
            deck.push(...ALL_CARDS.filter(c=>c.type==="trainer").slice(0,2));
            while(deck.length < 20) deck.push(ALL_CARDS[Math.floor(Math.random()*ALL_CARDS.length)]);
            return deck.sort(()=>Math.random()-0.5);
        }

        if (cmd.startsWith('!start ')) {
            const starter = text.split(' ')[1];
            const capName = starter.charAt(0).toUpperCase() + starter.slice(1);
            data.players[from] = { deck: createDeck(capName), hand: [], active: null, prizes: 3, collection: [] };
            data.players[from].hand = data.players[from].deck.splice(0,7);
            saveData();
            sock.sendMessage(chatId, { text: `Deck created with ${capName}! Use!hand`, mentions: [from] });
        }

        if (cmd === '!hand') {
            if (!data.players[from].hand) return sock.sendMessage(chatId, { text: "Use!start first!" });
            const hand = data.players[from].hand.map((c,i)=>`${i+1}. ${c.name}`).join('\n');
            sock.sendMessage(chatId, { text: `Your hand:\n${hand}`, mentions: [from] });
        }

        if (cmd.startsWith('!battle ')) {
            const opponent = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (!data.players[from].hand ||!data.players[opponent]?.hand) return sock.sendMessage(chatId, { text: "Both need!start first" });
            battles[from] = { opponent, turn: from };
            battles[opponent] = battles[from];
            sock.sendMessage(chatId, { text: `⚔️ Battle: @${from.split('@')[0]} vs @${opponent.split('@')[0]}\n@${from.split('@')[0]} goes first!`, mentions: [from, opponent] });
        }

        if (cmd.startsWith('!play ')) {
            const battle = battles[from];
            if (!battle || battle.turn!==from) return;
            const index = parseInt(text.split(' ')[1]) - 1;
            const card = data.players[from].hand[index];
            if (card.type === "pokemon" &&!data.players[from].active) {
                data.players[from].active = {...card, currentHP: card.hp};
                data.players[from].hand.splice(index,1);
                sock.sendMessage(chatId, { text: `@${from.split('@')[0]} sent out ${card.name}! HP:${card.hp}`, mentions: [from] });
            }
        }

        if (cmd === '!attack') {
            const battle = battles[from];
            if (!battle || battle.turn!==from) return;
            const p1 = data.players[from], p2 = data.players[battle.opponent];
            if(!p1.active ||!p2.active) return sock.sendMessage(chatId, { text: "Both need active pokemon!" });
            p2.active.currentHP -= p1.active.dmg;
            let msg = `${p1.active.name} hit for ${p1.active.dmg}!`;
            if (p2.active.currentHP <= 0) { msg += `\n${p2.active.name} fainted!`; p1.prizes--; p2.active = null; }
            battle.turn = battle.opponent;
            saveData();
            sock.sendMessage(chatId, { text: msg, mentions: [from, battle.turn] });
        }

        if (cmd === '!open') {
            if (data.wallets[from] < 100) return sock.sendMessage(chatId, { text: "Need 100 coins!" });
            data.wallets[from] -= 100;
            let pack = Array(5).fill(0).map(()=>ALL_CARDS[Math.floor(Math.random()*ALL_CARDS.length)]);
            data.players[from].collection.push(...pack);
            saveData();
            sock.sendMessage(chatId, { text: `Opened pack! 🎁\n${pack.map(c=>c.name).join(', ')}`, mentions: [from] });
        }

    });
}
startBot();
