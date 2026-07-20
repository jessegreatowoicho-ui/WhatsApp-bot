const { evaluate } = require('mathjs');
const QRCode = require('qrcode');
const db = require('../lib/database');

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = [
    {
        name: '!weather',
        category: 'Utility',
        cooldownMs: 3000,
        description: '!weather [city] - uses the free Open-Meteo geocoding + forecast APIs, no key needed',
        execute: async (ctx) => {
            const city = ctx.args.join(' ');
            if (!city) return ctx.reply('Usage: !weather [city]');
            try {
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
                const geo = await geoRes.json();
                const place = geo.results?.[0];
                if (!place) return ctx.reply('City not found.');
                const wRes = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m`
                );
                const w = await wRes.json();
                await ctx.reply(
                    `🌤️ Weather in ${place.name}, ${place.country}\n` +
                    `Temp: ${w.current.temperature_2m}°C\n` +
                    `Humidity: ${w.current.relative_humidity_2m}%\n` +
                    `Wind: ${w.current.wind_speed_10m} km/h`
                );
            } catch (err) {
                await ctx.reply('❌ Could not fetch weather right now.');
            }
        },
    },
    {
        name: '!qr',
        category: 'Utility',
        cooldownMs: 2000,
        description: '!qr [text] - generate a QR code image',
        execute: async (ctx) => {
            const content = ctx.text.slice(ctx.cmd.length).trim();
            if (!content) return ctx.reply('Usage: !qr [text or link]');
            const buffer = await QRCode.toBuffer(content);
            await ctx.sock.sendMessage(ctx.chatId, { image: buffer, caption: '📱 Here is your QR code' });
        },
    },
    {
        name: '!genpass',
        aliases: ['!password'],
        category: 'Utility',
        cooldownMs: 1000,
        description: '!genpass [length] - default 16',
        execute: async (ctx) => {
            const length = Math.min(64, Math.max(6, parseInt(ctx.args[0], 10) || 16));
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
            let out = '';
            for (let i = 0; i < length; i++) out += chars[rand(0, chars.length - 1)];
            await ctx.reply(`🔑 ${out}`);
        },
    },
    {
        name: '!calc',
        aliases: ['!calculate'],
        category: 'Utility',
        cooldownMs: 500,
        execute: async (ctx) => {
            const expr = ctx.text.slice(ctx.cmd.length).trim();
            if (!expr) return ctx.reply('Usage: !calc [expression]');
            try {
                const result = evaluate(expr);
                await ctx.reply(`🧮 ${expr} = ${result}`);
            } catch (err) {
                await ctx.reply('❌ Invalid expression.');
            }
        },
    },
    {
        name: '!convert',
        aliases: ['!currency'],
        category: 'Utility',
        cooldownMs: 2000,
        description: '!convert [amount] [from] [to], e.g. !convert 100 USD EUR',
        execute: async (ctx) => {
            const [amountStr, from, to] = ctx.args;
            const amount = parseFloat(amountStr);
            if (!amount || !from || !to) return ctx.reply('Usage: !convert [amount] [from] [to]');
            try {
                const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`);
                const rates = await res.json();
                const rate = rates.rates?.[to.toUpperCase()];
                if (!rate) return ctx.reply('Unknown currency code.');
                await ctx.reply(`💱 ${amount} ${from.toUpperCase()} = ${(amount * rate).toFixed(2)} ${to.toUpperCase()}`);
            } catch (err) {
                await ctx.reply('❌ Conversion service unavailable.');
            }
        },
    },
    {
        name: '!time',
        category: 'Utility',
        cooldownMs: 0,
        execute: async (ctx) => ctx.reply(`🕐 ${new Date().toUTCString()}`),
    },
    {
        name: '!wiki',
        aliases: ['!wikipedia'],
        category: 'Utility',
        cooldownMs: 2000,
        execute: async (ctx) => {
            const query = ctx.text.slice(ctx.cmd.length).trim();
            if (!query) return ctx.reply('Usage: !wiki [topic]');
            try {
                const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
                if (!res.ok) return ctx.reply('No Wikipedia article found for that.');
                const data = await res.json();
                await ctx.reply(`📖 *${data.title}*\n${data.extract}`);
            } catch (err) {
                await ctx.reply('❌ Wikipedia lookup failed.');
            }
        },
    },
    {
        name: '!search',
        aliases: ['!google'],
        category: 'Utility',
        cooldownMs: 3000,
        description: 'Web search summary via DuckDuckGo instant answers (no API key needed)',
        execute: async (ctx) => {
            const query = ctx.text.slice(ctx.cmd.length).trim();
            if (!query) return ctx.reply('Usage: !search [query]');
            try {
                const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
                const data = await res.json();
                const answer = data.AbstractText || data.Answer || data.RelatedTopics?.[0]?.Text;
                await ctx.reply(answer ? `🔎 ${answer}` : `No quick answer found. Try: https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
            } catch (err) {
                await ctx.reply('❌ Search failed.');
            }
        },
    },
    {
        name: '!remind',
        aliases: ['!reminder'],
        category: 'Utility',
        cooldownMs: 1000,
        description: '!remind [minutes] [text]',
        execute: async (ctx) => {
            const minutes = parseFloat(ctx.args[0]);
            const text = ctx.args.slice(1).join(' ');
            if (!minutes || !text) return ctx.reply('Usage: !remind [minutes] [text]');
            const fireAt = Date.now() + minutes * 60000;
            db.data.reminders.push({ jid: ctx.from, chatId: ctx.chatId, text, time: fireAt });
            db.save();
            setTimeout(async () => {
                try {
                    await ctx.sock.sendMessage(ctx.chatId, { text: `⏰ Reminder for ${ctx.mentionText(ctx.from)}: ${text}`, mentions: [ctx.from] });
                } catch (_) { /* chat may be gone */ }
            }, minutes * 60000);
            await ctx.reply(`⏰ Reminder set for ${minutes} minute(s) from now.`);
        },
    },
    {
        name: '!note',
        category: 'Utility',
        cooldownMs: 500,
        description: '!note add [text] | !note list | !note del [number]',
        execute: async (ctx) => {
            db.ensurePlayer(ctx.from);
            const notes = db.data.notes[ctx.from];
            const sub = ctx.args[0]?.toLowerCase();
            if (sub === 'add') {
                const text = ctx.args.slice(1).join(' ');
                if (!text) return ctx.reply('Usage: !note add [text]');
                notes.push(text);
                db.save();
                await ctx.reply(`📝 Note saved (#${notes.length})`);
            } else if (sub === 'del') {
                const idx = parseInt(ctx.args[1], 10) - 1;
                if (Number.isNaN(idx) || !notes[idx]) return ctx.reply('Usage: !note del [number]');
                notes.splice(idx, 1);
                db.save();
                await ctx.reply('🗑️ Note deleted.');
            } else {
                await ctx.reply(notes.length ? notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : 'No notes yet. !note add [text]');
            }
        },
    },
];
