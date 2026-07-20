function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
    return arr[rand(0, arr.length - 1)];
}

const JOKES = [
    'Why do programmers prefer dark mode? Because light attracts bugs.',
    "I told my computer I needed a break, and it said 'no problem, I'll go to sleep.'",
    'Why do Java developers wear glasses? Because they don\'t see sharp.',
    'How many programmers does it take to change a light bulb? None, it\'s a hardware problem.',
];
const QUOTES = [
    '"The only way to do great work is to love what you do." - Steve Jobs',
    '"Success is not final, failure is not fatal." - Winston Churchill',
    '"In the middle of difficulty lies opportunity." - Albert Einstein',
];
const FACTS = [
    'Honey never spoils.',
    'Octopuses have three hearts.',
    'Bananas are berries, but strawberries are not.',
    'A day on Venus is longer than a year on Venus.',
];
const EIGHTBALL = ['Yes.', 'No.', 'Definitely.', 'Ask again later.', 'Very doubtful.', 'Without a doubt.', 'Not looking good.'];
const COMPLIMENTS = ['You light up every room you walk into.', "You're sharper than you give yourself credit for.", 'Your energy is contagious.'];
const ROASTS = [
    "You're proof that even bugs need a home.",
    'You have something on your chin... no, the third one down.',
    "I'd explain it again but I'm out of crayons.",
];
const MEME_CAPTIONS = [
    'When the code finally works and you have no idea why',
    'Me pretending to understand the meeting',
    'That one bug that only appears in production',
];

module.exports = [
    {
        name: '!meme',
        category: 'Fun',
        cooldownMs: 2000,
        description: 'Fetches a random meme (needs internet)',
        execute: async (ctx) => {
            try {
                const res = await fetch('https://meme-api.com/gimme');
                const data = await res.json();
                if (data?.url) {
                    await ctx.sock.sendMessage(ctx.chatId, { image: { url: data.url }, caption: data.title || '' });
                } else {
                    await ctx.reply(pick(MEME_CAPTIONS));
                }
            } catch (_) {
                await ctx.reply('Meme service is unavailable right now.');
            }
        },
    },
    { name: '!joke', category: 'Fun', cooldownMs: 1000, execute: async (ctx) => ctx.reply(`😂 ${pick(JOKES)}`) },
    { name: '!quote', category: 'Fun', cooldownMs: 1000, execute: async (ctx) => ctx.reply(`💬 ${pick(QUOTES)}`) },
    { name: '!fact', category: 'Fun', cooldownMs: 1000, execute: async (ctx) => ctx.reply(`🧠 ${pick(FACTS)}`) },
    {
        name: '!8ball',
        category: 'Fun',
        cooldownMs: 1000,
        execute: async (ctx) => {
            if (!ctx.args.length) return ctx.reply('Usage: !8ball [question]');
            await ctx.reply(`🎱 ${pick(EIGHTBALL)}`);
        },
    },
    {
        name: '!ship',
        category: 'Fun',
        cooldownMs: 1000,
        execute: async (ctx) => {
            const a = ctx.mentioned[0];
            const b = ctx.mentioned[1];
            if (!a || !b) return ctx.reply('Usage: !ship @user1 @user2');
            await ctx.reply(`💘 Ship rate for ${ctx.mentionText(a)} x ${ctx.mentionText(b)}: ${rand(0, 100)}%`, [a, b]);
        },
    },
    { name: '!dice', category: 'Fun', cooldownMs: 1000, execute: async (ctx) => ctx.reply(`🎲 You rolled a ${rand(1, 6)}`) },
    {
        name: '!coinflip',
        aliases: ['!cf'],
        category: 'Fun',
        cooldownMs: 1000,
        execute: async (ctx) => ctx.reply(`🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}!`),
    },
    {
        name: '!compliment',
        category: 'Fun',
        cooldownMs: 1000,
        execute: async (ctx) => {
            const target = ctx.mentioned[0] || ctx.from;
            await ctx.reply(`✨ ${ctx.mentionText(target)}, ${pick(COMPLIMENTS)}`, [target]);
        },
    },
    {
        name: '!roast',
        category: 'Fun',
        cooldownMs: 1000,
        description: 'Playful, non-offensive roast - all in good fun',
        execute: async (ctx) => {
            const target = ctx.mentioned[0] || ctx.from;
            await ctx.reply(`🔥 ${ctx.mentionText(target)}, ${pick(ROASTS)}`, [target]);
        },
    },
];
