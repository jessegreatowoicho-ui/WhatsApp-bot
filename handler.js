const config = require('../config');
const db = require('./database');
const logger = require('./logger');

const registry = new Map(); // name -> command def
const aliasMap = new Map(); // alias -> name

function register(commandDefs) {
    for (const def of commandDefs) {
        if (!def.name || !def.execute) {
            logger.warn('Skipping malformed command definition', def);
            continue;
        }
        registry.set(def.name, def);
        for (const alias of def.aliases || []) {
            aliasMap.set(alias, def.name);
        }
    }
}

function resolve(name) {
    return registry.get(name) || registry.get(aliasMap.get(name));
}

function allCommands() {
    return [...registry.values()];
}

async function dispatch(ctx) {
    const def = resolve(ctx.cmd);
    if (!def) return false;

    if (def.groupOnly && !ctx.isGroup) {
        await ctx.reply('This command only works in groups.');
        return true;
    }
    if (def.ownerOnly && !config.OWNERS.includes(ctx.from)) {
        await ctx.reply('🚫 This command is owner-only.');
        return true;
    }
    if (def.adminOnly && ctx.isGroup && !ctx.isAdmin) {
        await ctx.reply('🚫 This command is admin-only.');
        return true;
    }

    const cooldownMs = def.cooldownMs ?? config.DEFAULT_COMMAND_COOLDOWN_MS;
    if (cooldownMs > 0) {
        const remaining = db.getCooldownRemaining(`cmd:${def.name}`, ctx.from, cooldownMs);
        if (remaining > 0) {
            await ctx.reply(`⏳ Slow down! Try again in ${Math.ceil(remaining / 1000)}s.`);
            return true;
        }
    }

    try {
        await def.execute(ctx);
        if (cooldownMs > 0) db.setCooldown(`cmd:${def.name}`, ctx.from);
    } catch (err) {
        logger.error(`Command "${def.name}" threw:`, err);
        await ctx.reply('❌ Something went wrong running that command.').catch(() => {});
    }
    return true;
}

module.exports = { register, resolve, allCommands, dispatch };
