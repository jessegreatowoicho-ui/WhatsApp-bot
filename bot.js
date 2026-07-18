const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');

const DATA_FILE = 'bot_data.json';
const STARTING_BALANCE = 1000;
const DAILY_AMOUNT = 500;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PACK_COST = 100;
const STARTER_NAMES = ['pikachu', 'charizard', 'blastoise'];

// ---------- persistence ----------
let data = { wallets: {}, daily: {}, players: {} };

if (fs.existsSync(DATA_FILE)) {
    try {
        const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        data = { wallets: {}, daily: {}, players: {}, ...loaded };
    } catch (err) {
        console.error('Failed to parse bot_data.json, starting fresh:', err);
    }
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Failed to save data:', err);
    }
}

function ensurePlayer(jid) {
    if (data.wallets[jid] === undefined) data.wallets[jid] = STARTING_BALANCE;
    if (!data.players[jid]) data.players[jid] = { collection: [] };
}

const ALL_CARDS = [
    { name: 'Pikachu', hp: 60, attack: 'Thunder Shock', dmg: 20, type: 'pokemon' },
    { name: 'Charizard', hp: 120, attack: 'Flamethrower', dmg: 50, type: 'pokemon' },
    { name: 'Blastoise', hp: 100, attack: 'Water Gun', dmg: 40, type: 'pokemon' },
    { name: 'Electric Energy', type: 'energy' },
    { name: 'Fire Energy', type: 'energy' },
    { name: 'Water Energy', type: 'energy' },
    { name: 'Potion', type: 'trainer', effect: 'Heal 20' },
];

// battles keyed by jid -> { player1, player2, turn }
let battles = {};

function mention(jid) {
    return `@${jid.split('@')[0]}`;
}

function parseBet(text) {
    const parts = text.trim().split(/\s+/);
    const bet = parseInt(parts[1], 10);
    return Number.isFinite(bet) ? bet : NaN;
}

function createDeck(starterName) {
    const starterCard = ALL_CARDS.find(c => c.name === starterName);
    let deck = [starterCard];
    deck.push(...ALL_CARDS.filter(c => c.type === 'energy').slice(0, 8));
    deck.push(...ALL_CARDS.filter(c => c.type === 'trainer').slice(0, 2));
    while (deck.length < 20) {
        deck.push(ALL_CARDS[Math.floor(Math.random() * ALL_CARDS.length)]);
    }
    return deck.sort(() => Math.random() - 0.5);
}

function endBattle(from, opponent) {
    delete battles[from];
    delete battles[opponent];
}

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
                startBot();
            } else {
                console.log('Logged out. Delete auth_info to re-scan a QR code.');
            }
        } else if (connection === 'open') {
            console.log('Connected!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.message || msg.key.fromMe) return;

        try {
            const chatId = msg.key.remoteJid;
            const from = msg.key.participant || msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
            const cmd = text.toLowerCase();

            ensurePlayer(from);

            if (cmd === '!menu') {
                await sock.sendMessage(chatId, {
                    text:
                        '*BOT BOY* 🤖\n\n' +
                        '*CASINO* 🎰\n' +
                        '!balance\n!daily\n!flip [amount] [heads/tails]\n!slots [amount]\n!top\n\n' +
                        '*POKEMON* 🃏\n' +
                        '!start [pikachu/charizard/blastoise]\n!hand\n!play [1-7]\n!attack\n!battle @user\n!open\n!collection',
                });
                return;
            }

            if (cmd === '!balance') {
                await sock.sendMessage(chatId, {
                    text: `💰 ${mention(from)} coins: ${data.wallets[from].toLocaleString()} 🪙`,
                    mentions: [from],
                });
                return;
            }

            if (cmd === '!daily') {
                const lastDaily = data.daily[from] || 0;
                const now = Date.now();
                if (now - lastDaily < DAILY_COOLDOWN_MS) {
                    const hoursLeft = Math.ceil((DAILY_COOLDOWN_MS - (now - lastDaily)) / 3600000);
                    await sock.sendMessage(chatId, { text: `${mention(from)} Come back in ${hoursLeft}h`, mentions: [from] });
                    return;
                }
                data.wallets[from] += DAILY_AMOUNT;
                data.daily[from] = now;
                saveData();
                await sock.sendMessage(chatId, {
                    text: `${mention(from)} Claimed +${DAILY_AMOUNT} coins! New balance: ${data.wallets[from].toLocaleString()}`,
                    mentions: [from],
                });
                return;
            }

            if (cmd.startsWith('!flip ')) {
                const bet = parseBet(text);
                const choice = text.trim().split(/\s+/)[2]?.toLowerCase();
                if (!Number.isInteger(bet) || bet <= 0) {
                    await sock.sendMessage(chatId, { text: 'Usage: !flip [positive amount] [heads/tails]' });
                    return;
                }
                if (choice !== 'heads' && choice !== 'tails') {
                    await sock.sendMessage(chatId, { text: 'Pick heads or tails!' });
                    return;
                }
                if (bet > data.wallets[from]) {
                    await sock.sendMessage(chatId, { text: 'Not enough coins!' });
                    return;
                }
                data.wallets[from] -= bet;
                const result = Math.random() < 0.5 ? 'heads' : 'tails';
                if (choice === result) data.wallets[from] += bet * 2;
                saveData();
                await sock.sendMessage(chatId, {
                    text: `🪙 ${result.toUpperCase()}! ${choice === result ? `Won ${bet}` : `Lost ${bet}`} | Balance: ${data.wallets[from].toLocaleString()}`,
                    mentions: [from],
                });
                return;
            }

            if (cmd.startsWith('!slots ')) {
                const bet = parseBet(text);
                if (!Number.isInteger(bet) || bet <= 0) {
                    await sock.sendMessage(chatId, { text: 'Usage: !slots [positive amount]' });
                    return;
                }
                if (bet > data.wallets[from]) {
                    await sock.sendMessage(chatId, { text: 'Not enough coins!' });
                    return;
                }
                data.wallets[from] -= bet;
                const emojis = ['🍒', '🍋', '7', '⭐', '🔔'];
                const spin = Array(3).fill(0).map(() => emojis[Math.floor(Math.random() * emojis.length)]);
                const win = spin[0] === spin[1] && spin[1] === spin[2] ? bet * 10
                    : (spin[0] === spin[1] || spin[1] === spin[2]) ? bet * 2
                    : 0;
                data.wallets[from] += win;
                saveData();
                await sock.sendMessage(chatId, {
                    text: `🎰 ${spin.join(' ')} | ${win > 0 ? `Won ${win}` : `Lost ${bet}`} | Balance: ${data.wallets[from].toLocaleString()}`,
                    mentions: [from],
                });
                return;
            }

            if (cmd === '!top') {
                const sorted = Object.keys(data.wallets).sort((a, b) => data.wallets[b] - data.wallets[a]).slice(0, 5);
                let text = '🏆 TOP 5 🏆\n';
                sorted.forEach((u, i) => { text += `${i + 1}. ${mention(u)}: ${data.wallets[u].toLocaleString()}\n`; });
                await sock.sendMessage(chatId, { text, mentions: sorted });
                return;
            }

            if (cmd.startsWith('!start ')) {
                const starter = text.trim().split(/\s+/)[1]?.toLowerCase();
                if (!STARTER_NAMES.includes(starter)) {
                    await sock.sendMessage(chatId, { text: `Choose a valid starter: ${STARTER_NAMES.join(', ')}` });
                    return;
                }
                const capName = starter.charAt(0).toUpperCase() + starter.slice(1);
                const existingCollection = data.players[from]?.collection || [];
                const deck = createDeck(capName);
                const hand = deck.splice(0, 7);
                data.players[from] = { deck, hand, active: null, prizes: 3, collection: existingCollection };
                saveData();
                await sock.sendMessage(chatId, { text: `Deck created with ${capName}! Use !hand`, mentions: [from] });
                return;
            }

            if (cmd === '!hand') {
                const hand = data.players[from].hand;
                if (!hand) {
                    await sock.sendMessage(chatId, { text: 'Use !start first!' });
                    return;
                }
                const handText = hand.map((c, i) => `${i + 1}. ${c.name}`).join('\n') || '(empty)';
                await sock.sendMessage(chatId, { text: `Your hand:\n${handText}`, mentions: [from] });
                return;
            }

            if (cmd === '!collection') {
                const collection = data.players[from]?.collection || [];
                if (collection.length === 0) {
                    await sock.sendMessage(chatId, { text: 'Your collection is empty. Try !open to buy a pack!' });
                    return;
                }
                const counts = {};
                collection.forEach(c => { counts[c.name] = (counts[c.name] || 0) + 1; });
                const listText = Object.entries(counts).map(([name, count]) => `${name} x${count}`).join('\n');
                await sock.sendMessage(chatId, { text: `📚 Your collection:\n${listText}`, mentions: [from] });
                return;
            }

            if (cmd.startsWith('!battle ')) {
                const opponent = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                if (!opponent) {
                    await sock.sendMessage(chatId, { text: 'Mention someone to battle! e.g. !battle @user' });
                    return;
                }
                if (opponent === from) {
                    await sock.sendMessage(chatId, { text: "You can't battle yourself!" });
                    return;
                }
                ensurePlayer(opponent);
                if (!data.players[from].hand || !data.players[opponent].hand) {
                    await sock.sendMessage(chatId, { text: 'Both players need !start first' });
                    return;
                }
                if (battles[from] || battles[opponent]) {
                    await sock.sendMessage(chatId, { text: 'One of you is already in a battle!' });
                    return;
                }
                const battle = { player1: from, player2: opponent, turn: from };
                battles[from] = battle;
                battles[opponent] = battle;
                await sock.sendMessage(chatId, {
                    text: `⚔️ Battle: ${mention(from)} vs ${mention(opponent)}\n${mention(from)} goes first! Use !play [number] to send out a Pokemon.`,
                    mentions: [from, opponent],
                });
                return;
            }

            if (cmd.startsWith('!play ')) {
                const battle = battles[from];
                if (!battle) {
                    await sock.sendMessage(chatId, { text: "You're not in a battle. Use !battle @user first." });
                    return;
                }
                if (battle.turn !== from) {
                    await sock.sendMessage(chatId, { text: "It's not your turn!" });
                    return;
                }
                const index = parseInt(text.trim().split(/\s+/)[1], 10) - 1;
                const hand = data.players[from].hand;
                const card = hand?.[index];
                if (!card) {
                    await sock.sendMessage(chatId, { text: 'Invalid card number. Check !hand.' });
                    return;
                }

                const player = data.players[from];
                if (card.type === 'pokemon') {
                    if (player.active) {
                        await sock.sendMessage(chatId, { text: 'You already have an active Pokemon!' });
                        return;
                    }
                    player.active = { ...card, currentHP: card.hp };
                    hand.splice(index, 1);
                    saveData();
                    await sock.sendMessage(chatId, { text: `${mention(from)} sent out ${card.name}! HP:${card.hp}`, mentions: [from] });
                } else if (card.type === 'trainer' && card.name === 'Potion') {
                    if (!player.active) {
                        await sock.sendMessage(chatId, { text: 'You need an active Pokemon to heal!' });
                        return;
                    }
                    player.active.currentHP = Math.min(player.active.hp, player.active.currentHP + 20);
                    hand.splice(index, 1);
                    saveData();
                    await sock.sendMessage(chatId, { text: `${mention(from)} used Potion! ${player.active.name} healed to ${player.active.currentHP} HP.`, mentions: [from] });
                } else {
                    await sock.sendMessage(chatId, { text: `${card.name} has no effect right now.` });
                }
                return;
            }

            if (cmd === '!attack') {
                const battle = battles[from];
                if (!battle) {
                    await sock.sendMessage(chatId, { text: "You're not in a battle." });
                    return;
                }
                if (battle.turn !== from) {
                    await sock.sendMessage(chatId, { text: "It's not your turn!" });
                    return;
                }
                const opponent = battle.player1 === from ? battle.player2 : battle.player1;
                const p1 = data.players[from];
                const p2 = data.players[opponent];
                if (!p1.active || !p2.active) {
                    await sock.sendMessage(chatId, { text: 'Both players need an active Pokemon! Use !play.' });
                    return;
                }
                p2.active.currentHP -= p1.active.dmg;
                let text = `${p1.active.name} hit ${p2.active.name} for ${p1.active.dmg}!`;
                if (p2.active.currentHP <= 0) {
                    text += `\n${p2.active.name} fainted!`;
                    p1.prizes--;
                    p2.active = null;
                    if (p1.prizes <= 0) {
                        text += `\n🏆 ${mention(from)} wins the battle!`;
                        endBattle(from, opponent);
                        saveData();
                        await sock.sendMessage(chatId, { text, mentions: [from, opponent] });
                        return;
                    }
                }
                battle.turn = opponent;
                saveData();
                await sock.sendMessage(chatId, { text, mentions: [from, opponent] });
                return;
            }

            if (cmd === '!open') {
                if (data.wallets[from] < PACK_COST) {
                    await sock.sendMessage(chatId, { text: `Need ${PACK_COST} coins!` });
                    return;
                }
                data.wallets[from] -= PACK_COST;
                const pack = Array(5).fill(0).map(() => ALL_CARDS[Math.floor(Math.random() * ALL_CARDS.length)]);
                data.players[from].collection.push(...pack);
                saveData();
                await sock.sendMessage(chatId, { text: `Opened pack! 🎁\n${pack.map(c => c.name).join(', ')}`, mentions: [from] });
                return;
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });
}

startBot();
