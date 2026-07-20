const config = require('../config');
const db = require('../lib/database');
const handler = require('../lib/handler');

const START_TIME = Date.now();

function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${d}d ${h}h ${m}m ${sec}s`;
}

module.exports = [
    {
        name: '!menu',
        aliases: ['!help'],
        category: 'General',
        cooldownMs: 0,
        description: 'Show the full command menu',
        execute: async (ctx) => {
            const byCategory = {};
            for (const cmd of handler.allCommands()) {
                if (cmd.ownerOnly) continue;
                byCategory[cmd.category] = byCategory[cmd.category] || [];
                byCategory[cmd.category].push(cmd.name);
            }
            let text = '*🤖 BOT MENU*\n\n';
            for (const [category, cmds] of Object.entries(byCategory)) {
                text += `*${category}*\n${cmds.join(' ')}\n\n`;
            }
            text += `Prefix: ${config.PREFIX} | Use ${config.PREFIX}ping to check I'm alive.`;
            await ctx.reply(text);
        },
    },
    {
        name: '!adminmenu',
        category: 'General',
        cooldownMs: 0,
        adminOnly: true,
        groupOnly: true,
        description: 'Admin-only command list',
        execute: async (ctx) => {
            const cmds = handler.allCommands().filter((c) => c.adminOnly);
            await ctx.reply(`*🛡️ ADMIN MENU*\n\n${cmds.map((c) => c.name).join('\n')}`);
        },
    },
    {
        name: '!ownermenu',
        category: 'General',
        cooldownMs: 0,
        ownerOnly: true,
        description: 'Owner-only command list',
        execute: async (ctx) => {
            const cmds = handler.allCommands().filter((c) => c.ownerOnly);
            await ctx.reply(`*👑 OWNER MENU*\n\n${cmds.map((c) => c.name).join('\n')}`);
        },
    },
    {
        name: '!ping',
        category: 'General',
        cooldownMs: 2000,
        description: 'Check bot responsiveness',
        execute: async (ctx) => {
            const start = Date.now();
            await ctx.reply('🏓 Pong...');
            const latency = Date.now() - start;
            await ctx.reply(`Latency: ${latency}ms`);
        },
    },
    {
        name: '!uptime',
        category: 'General',
        cooldownMs: 0,
        description: 'How long the bot has been running',
        execute: async (ctx) => {
            await ctx.reply(`⏱️ Uptime: ${formatUptime(Date.now() - START_TIME)}`);
        },
    },
    {
        name: '!stats',
        category: 'General',
        cooldownMs: 5000,
        description: 'Bot-wide statistics',
        execute: async (ctx) => {
            const userCount = Object.keys(db.data.wallets).length;
            const groupCount = Object.keys(db.data.groupSettings).length;
            const mem = process.memoryUsage().heapUsed / 1024 / 1024;
            await ctx.reply(
                `*📊 STATS*\n` +
                `Users tracked: ${userCount}\n` +
                `Groups configured: ${groupCount}\n` +
                `Memory: ${mem.toFixed(1)} MB\n` +
                `Uptime: ${formatUptime(Date.now() - START_TIME)}`
            );
        },
    },
];
