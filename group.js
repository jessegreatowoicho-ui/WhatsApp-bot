const db = require('../lib/database');

const BADWORDS = ['badword1', 'badword2']; // fill in your own filter list
const LINK_REGEX = /(https?:\/\/|chat\.whatsapp\.com\/|www\.)/i;

function ensureGroupSettings(chatId) {
    if (!db.data.groupSettings[chatId]) {
        db.data.groupSettings[chatId] = {
            welcome: true,
            antilink: false,
            antispam: false,
            antibadword: false,
            warns: {},
        };
    }
    return db.data.groupSettings[chatId];
}

// Called from index.js on every group message BEFORE command dispatch,
// to enforce anti-link / anti-badword / anti-spam. Returns true if the
// message was moderated (deleted/warned) so index.js can stop processing it.
async function moderateMessage(ctx) {
    if (!ctx.isGroup) return false;
    const settings = ensureGroupSettings(ctx.chatId);
    const isAdmin = ctx.isAdmin;
    if (isAdmin) return false; // never moderate admins

    let violated = false;
    if (settings.antilink && LINK_REGEX.test(ctx.text)) violated = 'link';
    if (settings.antibadword && BADWORDS.some((w) => ctx.text.toLowerCase().includes(w))) violated = 'bad word';

    if (violated) {
        try {
            await ctx.sock.sendMessage(ctx.chatId, { delete: ctx.msg.key });
        } catch (_) { /* bot may not be admin - ignore */ }
        settings.warns[ctx.from] = (settings.warns[ctx.from] || 0) + 1;
        db.save();
        await ctx.reply(`⚠️ ${ctx.mentionText(ctx.from)} that ${violated} isn't allowed here. Warning ${settings.warns[ctx.from]}/3`, [ctx.from]);
        if (settings.warns[ctx.from] >= 3 && ctx.isBotAdmin) {
            try {
                await ctx.sock.groupParticipantsUpdate(ctx.chatId, [ctx.from], 'remove');
                await ctx.reply(`🚫 ${ctx.mentionText(ctx.from)} removed after 3 warnings.`, [ctx.from]);
            } catch (_) { /* ignore */ }
        }
        return true;
    }
    return false;
}

module.exports.moderateMessage = moderateMessage;

module.exports.commands = [
    {
        name: '!antilink',
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 0,
        execute: async (ctx) => {
            const settings = ensureGroupSettings(ctx.chatId);
            settings.antilink = ctx.args[0]?.toLowerCase() !== 'off';
            db.save();
            await ctx.reply(`🔗 Anti-link is now ${settings.antilink ? 'ON' : 'OFF'}`);
        },
    },
    {
        name: '!antispam',
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 0,
        execute: async (ctx) => {
            const settings = ensureGroupSettings(ctx.chatId);
            settings.antispam = ctx.args[0]?.toLowerCase() !== 'off';
            db.save();
            await ctx.reply(`🚫 Anti-spam is now ${settings.antispam ? 'ON' : 'OFF'}`);
        },
    },
    {
        name: '!antibadword',
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 0,
        execute: async (ctx) => {
            const settings = ensureGroupSettings(ctx.chatId);
            settings.antibadword = ctx.args[0]?.toLowerCase() !== 'off';
            db.save();
            await ctx.reply(`🤬 Anti-badword is now ${settings.antibadword ? 'ON' : 'OFF'}`);
        },
    },
    {
        name: '!welcome',
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 0,
        description: '!welcome [on|off] - toggle welcome/goodbye messages',
        execute: async (ctx) => {
            const settings = ensureGroupSettings(ctx.chatId);
            settings.welcome = ctx.args[0]?.toLowerCase() !== 'off';
            db.save();
            await ctx.reply(`👋 Welcome/goodbye messages are now ${settings.welcome ? 'ON' : 'OFF'}`);
        },
    },
    {
        name: '!tagall',
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 5000,
        execute: async (ctx) => {
            const meta = await ctx.sock.groupMetadata(ctx.chatId);
            const ids = meta.participants.map((p) => p.id);
            const text = ids.map((id) => `@${id.split('@')[0]}`).join(' ');
            await ctx.sock.sendMessage(ctx.chatId, { text: `📢 ${text}`, mentions: ids });
        },
    },
    {
        name: '!poll',
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 2000,
        description: '!poll Question? | option1 | option2 | option3',
        execute: async (ctx) => {
            const parts = ctx.text.slice(ctx.cmd.length).split('|').map((s) => s.trim()).filter(Boolean);
            if (parts.length < 3) return ctx.reply('Usage: !poll Question? | option1 | option2');
            const [question, ...options] = parts;
            await ctx.sock.sendMessage(ctx.chatId, {
                poll: { name: question, values: options, selectableCount: 1 },
            });
        },
    },
    {
        name: '!mute',
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 0,
        description: 'Restrict the group to admins-only messaging',
        execute: async (ctx) => {
            await ctx.sock.groupSettingUpdate(ctx.chatId, 'announcement');
            await ctx.reply('🔇 Group muted - only admins can send messages.');
        },
    },
    {
        name: '!unmute',
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 0,
        execute: async (ctx) => {
            await ctx.sock.groupSettingUpdate(ctx.chatId, 'not_announcement');
            await ctx.reply('🔊 Group unmuted - everyone can send messages.');
        },
    },
    {
        name: '!warn',
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 0,
        execute: async (ctx) => {
            const target = ctx.mentioned[0];
            if (!target) return ctx.reply('Usage: !warn @user');
            const settings = ensureGroupSettings(ctx.chatId);
            settings.warns[target] = (settings.warns[target] || 0) + 1;
            db.save();
            await ctx.reply(`⚠️ ${ctx.mentionText(target)} warned. Total: ${settings.warns[target]}/3`, [target]);
            if (settings.warns[target] >= 3 && ctx.isBotAdmin) {
                await ctx.sock.groupParticipantsUpdate(ctx.chatId, [target], 'remove');
                await ctx.reply(`🚫 ${ctx.mentionText(target)} removed after 3 warnings.`, [target]);
            }
        },
    },
    {
        name: '!kick',
        aliases: ['!ban'],
        category: 'Group',
        adminOnly: true,
        groupOnly: true,
        cooldownMs: 2000,
        description: 'Remove a member from THIS group (group moderation only, not a WhatsApp-wide ban)',
        execute: async (ctx) => {
            if (!ctx.isBotAdmin) return ctx.reply('⚠️ I need to be a group admin to remove members.');
            const target = ctx.mentioned[0];
            if (!target) return ctx.reply('Mention the user to remove, e.g. !kick @user');
            try {
                await ctx.sock.groupParticipantsUpdate(ctx.chatId, [target], 'remove');
                await ctx.reply(`✅ Removed ${ctx.mentionText(target)} from the group.`, [target]);
            } catch (err) {
                await ctx.reply('❌ Failed to remove that member.');
            }
        },
    },
];

module.exports.ensureGroupSettings = ensureGroupSettings;
