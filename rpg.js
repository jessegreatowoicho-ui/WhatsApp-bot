const config = require('../config');
const db = require('../lib/database');

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function fmt(n) {
    return n.toLocaleString();
}

function xpForNextLevel(level) {
    return level * config.XP_PER_LEVEL;
}

function addXp(jid, amount) {
    const rpg = db.data.rpg[jid];
    rpg.xp += amount;
    const leveledUp = [];
    while (rpg.xp >= xpForNextLevel(rpg.level)) {
        rpg.xp -= xpForNextLevel(rpg.level);
        rpg.level += 1;
        rpg.maxHp += 10;
        rpg.hp = rpg.maxHp;
        leveledUp.push(rpg.level);
    }
    return leveledUp;
}

const LOOT_TABLES = {
    fish: ['Common Fish', 'Rare Fish', 'Old Boot', 'Golden Fish'],
    mine: ['Coal', 'Iron Ore', 'Gold Ore', 'Diamond'],
    farm: ['Wheat', 'Carrot', 'Pumpkin', 'Golden Apple'],
};
const LOOT_WEIGHTS = [50, 30, 15, 5]; // index-aligned with LOOT_TABLES entries

function weightedLoot(table) {
    const total = LOOT_WEIGHTS.reduce((a, b) => a + b, 0);
    let roll = rand(1, total);
    for (let i = 0; i < table.length; i++) {
        roll -= LOOT_WEIGHTS[i];
        if (roll <= 0) return table[i];
    }
    return table[0];
}

function gatherCommand(name, tool, cooldownKey, cooldownMs, table) {
    return {
        name,
        category: 'RPG',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            if (tool && !(db.data.inventory[ctx.from][tool] > 0)) {
                await ctx.reply(`You need a ${tool} first. Buy one with !shop.`);
                return;
            }
            const remaining = db.getCooldownRemaining(cooldownKey, ctx.from, cooldownMs);
            if (remaining > 0) {
                await ctx.reply(`⏳ Wait ${Math.ceil(remaining / 60000)}m before you can ${cooldownKey} again.`);
                return;
            }
            db.setCooldown(cooldownKey, ctx.from);
            const loot = weightedLoot(table);
            db.addItem(ctx.from, loot, 1);
            const xpGain = rand(5, 15);
            const levelUps = addXp(ctx.from, xpGain);
            db.save();
            let msg = `You went ${cooldownKey}ing and found: ${loot}! (+${xpGain} XP)`;
            if (levelUps.length) msg += `\n🎉 Level up! You're now level ${levelUps[levelUps.length - 1]}`;
            await ctx.reply(msg);
        },
    };
}

module.exports = [
    {
        name: '!rank',
        aliases: ['!level', '!xp'],
        category: 'RPG',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const rpg = db.data.rpg[ctx.from];
            await ctx.reply(
                `⚔️ ${ctx.mentionText(ctx.from)}\nLevel: ${rpg.level}\nXP: ${rpg.xp}/${xpForNextLevel(rpg.level)}\nHP: ${rpg.hp}/${rpg.maxHp}`,
                [ctx.from]
            );
        },
    },
    {
        name: '!quest',
        aliases: ['!dailyquest'],
        category: 'RPG',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const remaining = db.getCooldownRemaining('quest', ctx.from, config.QUEST_COOLDOWN_MS);
            if (remaining > 0) {
                await ctx.reply(`⏳ New quest available in ${Math.ceil(remaining / 3600000)}h.`);
                return;
            }
            db.setCooldown('quest', ctx.from);
            const reward = rand(100, 400);
            const xpGain = rand(20, 50);
            db.data.wallets[ctx.from] += reward;
            const levelUps = addXp(ctx.from, xpGain);
            db.save();
            let msg = `📜 Quest complete! You earned ${fmt(reward)} 🪙 and ${xpGain} XP.`;
            if (levelUps.length) msg += `\n🎉 Level up! You're now level ${levelUps[levelUps.length - 1]}`;
            await ctx.reply(msg);
        },
    },
    {
        name: '!dungeon',
        category: 'RPG',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const remaining = db.getCooldownRemaining('dungeon', ctx.from, config.DUNGEON_COOLDOWN_MS);
            if (remaining > 0) {
                await ctx.reply(`⏳ You need to rest ${Math.ceil(remaining / 60000)}m before another dungeon run.`);
                return;
            }
            db.setCooldown('dungeon', ctx.from);
            const rpg = db.data.rpg[ctx.from];
            const success = Math.random() < 0.5 + rpg.level * 0.02;
            if (!success) {
                const dmg = rand(10, 30);
                rpg.hp = Math.max(1, rpg.hp - dmg);
                db.save();
                await ctx.reply(`💀 The dungeon got the better of you. You took ${dmg} damage. HP: ${rpg.hp}/${rpg.maxHp}`);
                return;
            }
            const gold = rand(150, 600);
            const rareLoot = ['Rare Loot: Enchanted Sword', 'Rare Loot: Mystic Orb', 'Rare Loot: Dragon Scale'][rand(0, 2)];
            const xpGain = rand(30, 80);
            db.data.wallets[ctx.from] += gold;
            db.addItem(ctx.from, rareLoot, 1);
            const levelUps = addXp(ctx.from, xpGain);
            db.save();
            let msg = `🗡️ Dungeon cleared! +${fmt(gold)} 🪙, +${xpGain} XP, and you found: ${rareLoot}`;
            if (levelUps.length) msg += `\n🎉 Level up! You're now level ${levelUps[levelUps.length - 1]}`;
            await ctx.reply(msg);
        },
    },
    {
        name: '!boss',
        aliases: ['!bossfight'],
        category: 'RPG',
        cooldownMs: 0,
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const remaining = db.getCooldownRemaining('boss', ctx.from, config.BOSS_COOLDOWN_MS);
            if (remaining > 0) {
                await ctx.reply(`⏳ The boss respawns in ${Math.ceil(remaining / 60000)}m.`);
                return;
            }
            db.setCooldown('boss', ctx.from);
            const rpg = db.data.rpg[ctx.from];
            const bossHp = 100 + rpg.level * 20;
            const playerPower = rpg.level * rand(15, 25);
            if (playerPower < bossHp * 0.6) {
                const dmg = rand(20, 40);
                rpg.hp = Math.max(1, rpg.hp - dmg);
                db.save();
                await ctx.reply(`💥 You were defeated by the boss! Took ${dmg} damage. HP: ${rpg.hp}/${rpg.maxHp}`);
                return;
            }
            const gold = rand(500, 1500);
            const xpGain = rand(100, 200);
            db.data.wallets[ctx.from] += gold;
            const levelUps = addXp(ctx.from, xpGain);
            db.save();
            let msg = `🐉 Boss defeated! +${fmt(gold)} 🪙, +${xpGain} XP`;
            if (levelUps.length) msg += `\n🎉 Level up! You're now level ${levelUps[levelUps.length - 1]}`;
            await ctx.reply(msg);
        },
    },
    gatherCommand('!fish', 'Fishing Rod', 'fish', config.FISH_COOLDOWN_MS, LOOT_TABLES.fish),
    gatherCommand('!mine', 'Pickaxe', 'mine', config.MINE_COOLDOWN_MS, LOOT_TABLES.mine),
    gatherCommand('!farm', 'Hoe', 'farm', config.FARM_COOLDOWN_MS, LOOT_TABLES.farm),
    {
        name: '!craft',
        category: 'RPG',
        cooldownMs: 2000,
        description: '!craft [item] - combine materials into gear (e.g. !craft sword needs 3 Iron Ore)',
        execute: async (ctx) => {
            const recipes = {
                sword: { needs: { 'Iron Ore': 3 }, result: 'Iron Sword' },
                ring: { needs: { 'Gold Ore': 2 }, result: 'Gold Ring' },
                pie: { needs: { Wheat: 2, Pumpkin: 1 }, result: 'Pumpkin Pie' },
            };
            const key = ctx.args[0]?.toLowerCase();
            const recipe = recipes[key];
            if (!recipe) {
                await ctx.reply(`Usage: !craft [${Object.keys(recipes).join('|')}]`);
                return;
            }
            db.ensurePlayer(ctx.from);
            const inv = db.data.inventory[ctx.from];
            const missing = Object.entries(recipe.needs).filter(([item, qty]) => (inv[item] || 0) < qty);
            if (missing.length) {
                await ctx.reply(`Missing: ${missing.map(([item, qty]) => `${qty}x ${item}`).join(', ')}`);
                return;
            }
            for (const [item, qty] of Object.entries(recipe.needs)) db.removeItem(ctx.from, item, qty);
            db.addItem(ctx.from, recipe.result, 1);
            await ctx.reply(`🔨 Crafted: ${recipe.result}!`);
        },
    },
    {
        name: '!pet',
        category: 'RPG',
        cooldownMs: 0,
        description: '!pet adopt [name] | !pet feed | !pet info',
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const rpg = db.data.rpg[ctx.from];
            const sub = ctx.args[0]?.toLowerCase();
            if (sub === 'adopt') {
                if (rpg.pet) {
                    await ctx.reply(`You already have a pet named ${rpg.pet.name}.`);
                    return;
                }
                const name = ctx.args.slice(1).join(' ') || 'Buddy';
                const species = ['Dragon', 'Wolf', 'Cat', 'Phoenix'][rand(0, 3)];
                rpg.pet = { name, species, level: 1, hunger: 100 };
                db.save();
                await ctx.reply(`🐾 You adopted a ${species} named ${name}!`);
            } else if (sub === 'feed') {
                if (!rpg.pet) {
                    await ctx.reply("You don't have a pet yet. !pet adopt [name]");
                    return;
                }
                rpg.pet.hunger = Math.min(100, rpg.pet.hunger + 30);
                db.save();
                await ctx.reply(`🍖 ${rpg.pet.name} is happily fed! Hunger: ${rpg.pet.hunger}/100`);
            } else {
                if (!rpg.pet) {
                    await ctx.reply("You don't have a pet yet. !pet adopt [name]");
                    return;
                }
                await ctx.reply(`🐾 ${rpg.pet.name} the ${rpg.pet.species}\nLevel: ${rpg.pet.level}\nHunger: ${rpg.pet.hunger}/100`);
            }
        },
    },
    {
        name: '!trade',
        category: 'RPG',
        cooldownMs: 2000,
        description: '!trade @user [item] [qty] - give an item to another player',
        execute: async (ctx) => {
            const target = ctx.mentioned[0];
            const item = ctx.args[1];
            const qty = parseInt(ctx.args[2], 10) || 1;
            if (!target || !item) {
                await ctx.reply('Usage: !trade @user [item name] [qty]');
                return;
            }
            db.ensurePlayer(ctx.from);
            db.ensurePlayer(target);
            const matched = Object.keys(db.data.inventory[ctx.from]).find((n) => n.toLowerCase() === item.toLowerCase());
            if (!matched || !db.removeItem(ctx.from, matched, qty)) {
                await ctx.reply("You don't have enough of that item.");
                return;
            }
            db.addItem(target, matched, qty);
            await ctx.reply(`🔄 Traded ${qty}x ${matched} to ${ctx.mentionText(target)}`, [target]);
        },
    },
    {
        name: '!guild',
        category: 'RPG',
        cooldownMs: 2000,
        description: '!guild create [name] | !guild join [name] | !guild info',
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const rpg = db.data.rpg[ctx.from];
            const sub = ctx.args[0]?.toLowerCase();
            const name = ctx.args.slice(1).join(' ');
            if (sub === 'create') {
                if (!name) return ctx.reply('Usage: !guild create [name]');
                if (db.data.guilds[name]) return ctx.reply('A guild with that name already exists.');
                db.data.guilds[name] = { owner: ctx.from, members: [ctx.from] };
                rpg.guild = name;
                db.save();
                await ctx.reply(`🏰 Guild "${name}" founded!`);
            } else if (sub === 'join') {
                const guild = db.data.guilds[name];
                if (!guild) return ctx.reply('That guild does not exist.');
                if (!guild.members.includes(ctx.from)) guild.members.push(ctx.from);
                rpg.guild = name;
                db.save();
                await ctx.reply(`🏰 Joined guild "${name}"!`);
            } else {
                if (!rpg.guild) return ctx.reply("You're not in a guild. !guild create [name]");
                const guild = db.data.guilds[rpg.guild];
                await ctx.reply(`🏰 ${rpg.guild}\nMembers: ${guild.members.length}`);
            }
        },
    },
];
