const config = require('../config');
const db = require('../lib/database');

const SHOP_ITEMS = {
    'Fishing Rod': { price: 150, desc: 'Needed to !fish' },
    'Pickaxe': { price: 200, desc: 'Needed to !mine' },
    'Hoe': { price: 150, desc: 'Needed to !farm' },
    'Lockpick': { price: 300, desc: 'Improves !rob odds' },
    'Shield': { price: 400, desc: 'Reduces chance of being robbed' },
};

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fmt(n) {
    return n.toLocaleString();
}

module.exports = [
    {
        name: '!balance',
        aliases: ['!bal', '!coins'],
        category: 'Economy',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const wallet = db.data.wallets[ctx.from];
            const bank = db.data.bank[ctx.from];
            await ctx.reply(`💰 ${ctx.mentionText(ctx.from)}\nWallet: ${fmt(wallet)} 🪙\nBank: ${fmt(bank)} 🏦`, [ctx.from]);
        },
    },
    {
        name: '!daily',
        category: 'Economy',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const remaining = db.getCooldownRemaining('daily', ctx.from, config.DAILY_COOLDOWN_MS);
            if (remaining > 0) {
                const hrs = Math.ceil(remaining / 3600000);
                await ctx.reply(`⏳ You already claimed today. Try again in ~${hrs}h.`);
                return;
            }
            db.data.wallets[ctx.from] += config.DAILY_AMOUNT;
            db.setCooldown('daily', ctx.from);
            db.save();
            await ctx.reply(`✅ Claimed your daily reward: +${fmt(config.DAILY_AMOUNT)} 🪙`);
        },
    },
    {
        name: '!work',
        category: 'Economy',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const remaining = db.getCooldownRemaining('work', ctx.from, config.WORK_COOLDOWN_MS);
            if (remaining > 0) {
                await ctx.reply(`⏳ You're tired. Rest ${Math.ceil(remaining / 60000)}m before working again.`);
                return;
            }
            const earned = rand(config.WORK_MIN, config.WORK_MAX);
            db.data.wallets[ctx.from] += earned;
            db.setCooldown('work', ctx.from);
            db.save();
            const jobs = ['delivered packages', 'fixed a bug', 'walked some dogs', 'flipped burgers', 'drove a taxi'];
            await ctx.reply(`💼 You ${jobs[rand(0, jobs.length - 1)]} and earned ${fmt(earned)} 🪙`);
        },
    },
    {
        name: '!beg',
        category: 'Economy',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const remaining = db.getCooldownRemaining('beg', ctx.from, config.BEG_COOLDOWN_MS);
            if (remaining > 0) {
                await ctx.reply(`⏳ Wait ${Math.ceil(remaining / 60000)}m before begging again.`);
                return;
            }
            if (Math.random() < 0.2) {
                db.setCooldown('beg', ctx.from);
                await ctx.reply('🙅 Nobody gave you anything this time.');
                return;
            }
            const earned = rand(config.BEG_MIN, config.BEG_MAX);
            db.data.wallets[ctx.from] += earned;
            db.setCooldown('beg', ctx.from);
            db.save();
            await ctx.reply(`🙏 A kind stranger gave you ${fmt(earned)} 🪙`);
        },
    },
    {
        name: '!crime',
        category: 'Economy',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const remaining = db.getCooldownRemaining('crime', ctx.from, config.CRIME_COOLDOWN_MS);
            if (remaining > 0) {
                await ctx.reply(`⏳ Lay low for ${Math.ceil(remaining / 60000)}m before your next job.`);
                return;
            }
            db.setCooldown('crime', ctx.from);
            if (Math.random() < config.CRIME_FAIL_CHANCE) {
                const loss = Math.min(config.CRIME_FAIL_PENALTY, db.data.wallets[ctx.from]);
                db.data.wallets[ctx.from] -= loss;
                db.save();
                await ctx.reply(`🚔 Busted! You paid a fine of ${fmt(loss)} 🪙`);
                return;
            }
            const earned = rand(config.CRIME_MIN, config.CRIME_MAX);
            db.data.wallets[ctx.from] += earned;
            db.save();
            await ctx.reply(`🕶️ The heist paid off! You made ${fmt(earned)} 🪙`);
        },
    },
    {
        name: '!rob',
        category: 'Economy',
        cooldownMs: 0,
        description: 'Attempt to steal coins from another user (in-game only, cooldown-limited)',
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const remaining = db.getCooldownRemaining('rob', ctx.from, config.ROB_COOLDOWN_MS);
            if (remaining > 0) {
                await ctx.reply(`⏳ Cool off ${Math.ceil(remaining / 60000)}m before robbing again.`);
                return;
            }
            const target = ctx.mentioned[0];
            if (!target) {
                await ctx.reply('Mention who you want to rob, e.g. !rob @user');
                return;
            }
            if (target === ctx.from) {
                await ctx.reply("You can't rob yourself.");
                return;
            }
            db.ensurePlayer(target);
            if (db.data.wallets[target] < config.ROB_MIN_TARGET_BALANCE) {
                await ctx.reply('That person is too broke to rob.');
                return;
            }
            db.setCooldown('rob', ctx.from);
            if (Math.random() < config.ROB_SUCCESS_CHANCE) {
                const stolen = Math.floor(db.data.wallets[target] * config.ROB_STEAL_PCT);
                db.data.wallets[target] -= stolen;
                db.data.wallets[ctx.from] += stolen;
                db.save();
                await ctx.reply(`💸 Success! You stole ${fmt(stolen)} 🪙 from ${ctx.mentionText(target)}`, [target]);
            } else {
                const fine = Math.floor(db.data.wallets[ctx.from] * 0.1);
                db.data.wallets[ctx.from] -= fine;
                db.save();
                await ctx.reply(`🚨 Caught in the act! You paid a ${fmt(fine)} 🪙 fine.`);
            }
        },
    },
    {
        name: '!deposit',
        aliases: ['!dep'],
        category: 'Economy',
        cooldownMs: 1000,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const amt = ctx.args[0] === 'all' ? db.data.wallets[ctx.from] : parseInt(ctx.args[0], 10);
            if (!amt || amt <= 0 || amt > db.data.wallets[ctx.from]) {
                await ctx.reply('Usage: !deposit [amount|all] (must not exceed your wallet balance)');
                return;
            }
            db.data.wallets[ctx.from] -= amt;
            db.data.bank[ctx.from] += amt;
            db.save();
            await ctx.reply(`🏦 Deposited ${fmt(amt)} 🪙`);
        },
    },
    {
        name: '!withdraw',
        aliases: ['!wd'],
        category: 'Economy',
        cooldownMs: 1000,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const amt = ctx.args[0] === 'all' ? db.data.bank[ctx.from] : parseInt(ctx.args[0], 10);
            if (!amt || amt <= 0 || amt > db.data.bank[ctx.from]) {
                await ctx.reply('Usage: !withdraw [amount|all] (must not exceed your bank balance)');
                return;
            }
            db.data.bank[ctx.from] -= amt;
            db.data.wallets[ctx.from] += amt;
            db.save();
            await ctx.reply(`🏦 Withdrew ${fmt(amt)} 🪙`);
        },
    },
    {
        name: '!shop',
        category: 'Economy',
        cooldownMs: 0,
        execute: async (ctx) => {
            const lines = Object.entries(SHOP_ITEMS).map(([name, i]) => `${name} - ${fmt(i.price)} 🪙 (${i.desc})`);
            await ctx.reply(`*🛒 SHOP*\n\n${lines.join('\n')}\n\nBuy with !buy [item name]`);
        },
    },
    {
        name: '!buy',
        category: 'Economy',
        cooldownMs: 1000,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const itemName = Object.keys(SHOP_ITEMS).find(
                (name) => name.toLowerCase() === ctx.text.slice(ctx.cmd.length).trim().toLowerCase()
            );
            if (!itemName) {
                await ctx.reply('Item not found. Check !shop for the exact name.');
                return;
            }
            const item = SHOP_ITEMS[itemName];
            if (db.data.wallets[ctx.from] < item.price) {
                await ctx.reply(`You need ${fmt(item.price)} 🪙 for that.`);
                return;
            }
            db.data.wallets[ctx.from] -= item.price;
            db.addItem(ctx.from, itemName, 1);
            await ctx.reply(`✅ Bought ${itemName} for ${fmt(item.price)} 🪙`);
        },
    },
    {
        name: '!inventory',
        aliases: ['!inv'],
        category: 'Economy',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const items = db.data.inventory[ctx.from];
            const lines = Object.entries(items).map(([name, qty]) => `${name} x${qty}`);
            await ctx.reply(lines.length ? `*🎒 INVENTORY*\n\n${lines.join('\n')}` : 'Your inventory is empty.');
        },
    },
    {
        name: '!achievements',
        aliases: ['!ach'],
        category: 'Economy',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const list = db.data.achievements[ctx.from];
            await ctx.reply(list.length ? `*🏆 ACHIEVEMENTS*\n\n${list.join('\n')}` : 'No achievements yet - get out there!');
        },
    },
    {
        name: '!leaderboard',
        aliases: ['!top', '!lb'],
        category: 'Economy',
        cooldownMs: 3000,
        execute: async (ctx) => {
            const ranked = Object.entries(db.data.wallets)
                .map(([jid, bal]) => [jid, bal + (db.data.bank[jid] || 0)])
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            const lines = ranked.map(([jid, total], i) => `${i + 1}. ${ctx.mentionText(jid)} - ${fmt(total)} 🪙`);
            await ctx.reply(`*🏆 LEADERBOARD*\n\n${lines.join('\n')}`, ranked.map(([jid]) => jid));
        },
    },
];
