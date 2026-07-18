const http = require('http');
// Keeps the bot alive on free hosting platforms like Render
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const pino = require('pino');

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
    
    // Added pino logger to prevent Baileys warnings
    const sock = makeWASocket({ 
        auth: state,
        printQRInTerminal: true, // THIS prints the QR code directly in your terminal!
        logger: pino({ level: 'silent' }) 
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed:', lastDisconnect.error?.message);
            if(shouldReconnect) {
                console.log('Reconnecting...');
                startBot();
            }
        }
        if(connection === 'open') {
            console.log('✅ Bot Connected Successfully!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const chatId = msg.key.remoteJid;
        const from = msg.key.participant || msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const cmd = text.toLowerCase();

        // Initialize user data
        if (!data.wallets[from]) data.wallets[from] = 1000;
        if (!data.players[from]) data.players[from] = {collection: []};

        // --- COMMANDS ---

        if (cmd === '!menu') {
            const menuText = `*BOT BOY* 🤖\n\n` +
                `*CASINO* 🎰\n` +
                `!balance\n!daily\n!flip [amount] [heads/tails]\n!slots [amount]\n!top\n\n` +
                `*POKEMON* 🃏\n` +
                `!start [pikachu/charizard/blastoise]\n!hand\n!play [1-7]\n!attack\n!battle @user\n!open\n!collection`;
            sock.sendMessage(chatId, { text: menuText });
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
            if (isNaN(bet) || bet <= 0) return sock.sendMessage(chatId, { text: "Invalid bet amount!" });
            if (bet > data.wallets[from]) return sock.sendMessage(chatId, { text: "Not enough coins!" });
            
            data.wallets[from] -= bet;
            const result = Math.random() < 0.5 ? 'heads' : 'tails';
            if (choice === result) data.wallets[from] += bet * 2;
            saveData();
            sock.sendMessage(chatId, { text: `🪙 ${result.toUpperCase()}! ${choice===result?`Won ${bet}`:`Lost ${bet}`} | Balance: ${data.wallets[from].toLocaleString()}`, mentions: [from] });
        }

        if (cmd.startsWith('!slots ')) {
            const bet = parseInt(text.split(' ')[1]);
            if (isNaN(bet) || bet <= 0) return sock.sendMessage(chatId, { text: "Invalid bet amount!" });
            if (bet > data.wallets[from]) return sock.sendMessage(chatId, { text: "Not enough coins!" });
            
            data.wallets[from] -= bet;
            const emojis = ['🍒','🍋','7️⃣','⭐','🔔'];
            const spin = Array(3).fill(0).map(()=>emojis[Math.floor(Math.random()*5)]);
            let win = spin[0]===spin[1] && spin[1]===spin[2] ? bet*10 : spin[0]===spin[1]||spin[1]===spin[2] ? bet*2 : 0;
            data.wallets[from] += win;
            saveData();
            sock.sendMessage(chatId, { text: `🎰 ${spin.join(' ')} | ${win>0?`Won ${win}`:`Lost ${bet}`} | Balance: ${data.wallets[from].toLocaleString()}`, mentions: [from] });
        }

        if (cmd === '!top') {
            const sorted = Object.keys(data.wallets).filter(k=>!k.includes('_daily')).sort((a,b)=>data.wallets[b]-data.wallets[a]).slice(0,5);
            let topMsg = "🏆 *TOP 5 RICHEST* 🏆\n";
            sorted.forEach((u,i)=> topMsg += `${i+1}. @${u.split('@')[0]}: ${data.wallets[u].toLocaleString()} 🪙\n`);
            sock.sendMessage(chatId, { text: topMsg, mentions: sorted });
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
            const validStarters = ['pikachu', 'charizard', 'blastoise'];
            if (!validStarters.includes(starter)) return sock.sendMessage(chatId, { text: "Invalid starter! Choose: pikachu, charizard, or blastoise" });
            
            const capName = starter.charAt(0).toUpperCase() + starter.slice(1);
            data.players[from] = { deck: createDeck(capName), hand: [], active: null, prizes: 3, collection: data.players[from].collection || [] };
            data.players[from].hand = data.players[from].deck.splice(0,7);
            saveData();
            sock.sendMessage(chatId, { text: `Deck created with ${capName}! 🔥\nUse !hand to see your cards.`, mentions: [from] });
        }

        if (cmd === '!hand') {
            if (!data.players[from].hand || data.players[from].hand.length === 0) return sock.sendMessage(chatId, { text: "You don't have a deck! Use !start [pokemon] first." });
            const hand = data.players[from].hand.map((c,i)=>`${i+1}. ${c.name} (${c.type})`).join('\n');
            sock.sendMessage(chatId, { text: `*Your Hand:*\n${hand}`, mentions: [from] });
        }

        if (cmd.startsWith('!battle ')) {
            const opponent = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (!opponent) return sock.sendMessage(chatId, { text: "You must tag a user to battle! Example: !battle @user" });
            if (!data.players[from].hand || !data.players[opponent]?.hand) return sock.sendMessage(chatId, { text: "Both players need to use !start first!" });
            
            battles[from] = { opponent, turn: from };
            battles[opponent] = battles[from];
            sock.sendMessage(chatId, { text: `⚔️ *BATTLE STARTED!* ⚔️\n@${from.split('@')[0]} vs @${opponent.split('@')[0]}\n\n@${from.split('@')[0]} goes first! Use !play [number] to put out a Pokemon.`, mentions: [from, opponent] });
        }

        if (cmd.startsWith('!play ')) {
            const battle = battles[from];
            if (!battle || battle.turn !== from) return;
            const index = parseInt(text.split(' ')[1]) - 1;
            const card = data.players[from].hand[index];
            
            if (!card) return sock.sendMessage(chatId, { text: "Invalid card number!" });
            if (card.type === "pokemon" && !data.players[from].active) {
                data.players[from].active = {...card, currentHP: card.hp};
                data.players[from].hand.splice(index,1);
                sock.sendMessage(chatId, { text: `@${from.split('@')[0]} sent out *${card.name}*! ❤️ HP: ${card.hp}\n\nUse !attack to strike!`, mentions: [from] });
            } else {
                sock.sendMessage(chatId, { text: "You already have an active Pokemon, or that card isn't a Pokemon!" });
            }
        }

        if (cmd === '!attack') {
            const battle = battles[from];
            if (!battle || battle.turn !== from) return;
            const p1 = data.players[from], p2 = data.players[battle.opponent];
            if(!p1.active || !p2.active) return sock.sendMessage(chatId, { text: "Both players need active pokemon! Use !play first." });
            
            p2.active.currentHP -= p1.active.dmg;
            let atkMsg = `⚡ *${p1.active.name}* used ${p1.active.attack} and hit for ${p1.active.dmg} damage!\n` +
                         `Enemy ${p2.active.name} HP: ${Math.max(0, p2.active.currentHP)}/${p2.active.hp}`;
                         
            if (p2.active.currentHP <= 0) { 
                atkMsg += `\n\n💀 *${p2.active.name} fainted!*`; 
                p1.prizes--; 
                p2.active = null; 
            }
            battle.turn = battle.opponent;
            saveData();
            sock.sendMessage(chatId, { text: atkMsg, mentions: [from, battle.opponent] });
        }

        if (cmd === '!open') {
            if (data.wallets[from] < 100) return sock.sendMessage(chatId, { text: "Need 100 coins to open a pack!" });
            data.wallets[from] -= 100;
            let pack = Array(5).fill(0).map(()=>ALL_CARDS[Math.floor(Math.random()*ALL_CARDS.length)]);
            data.players[from].collection.push(...pack);
            saveData();
            sock.sendMessage(chatId, { text: `🎁 *Opened a Pack! (-100 coins)*\n\n${pack.map(c=>`✨ ${c.name}`).join('\n')}`, mentions: [from] });
        }

        if (cmd === '!collection') {
            const coll = data.players[from].collection;
            if (!coll || coll.length === 0) return sock.sendMessage(chatId, { text: "Your collection is empty! Use !open to buy packs." });
            const counts = {};
            coll.forEach(c => counts[c.name] = (counts[c.name] || 0) + 1);
            const msg = Object.entries(counts).map(([name, count]) => `🃏 ${name} x${count}`).join('\n');
            sock.sendMessage(chatId, { text: `*Your Collection:*\n${msg}` });
        }
    });
}

startBot();
```
.
