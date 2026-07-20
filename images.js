const Jimp = require('jimp');
const config = require('../config');

async function getQuotedImageBuffer(ctx) {
    return ctx.downloadQuotedMedia();
}

async function addCaptionBar(buffer, topText, bottomText) {
    const image = await Jimp.read(buffer);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE_1);
    const barHeight = 60;
    const canvas = new Jimp(image.bitmap.width, image.bitmap.height + (topText ? barHeight : 0) + (bottomText ? barHeight : 0), 0x000000ff);
    let y = 0;
    if (topText) {
        canvas.print(font, 0, 10, { text: topText, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, canvas.bitmap.width);
        y = barHeight;
    }
    canvas.composite(image, 0, y);
    if (bottomText) {
        canvas.print(font, 0, y + image.bitmap.height + 10, { text: bottomText, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, canvas.bitmap.width);
    }
    return canvas.getBufferAsync(Jimp.MIME_JPEG);
}

module.exports = [
    {
        name: '!meme2',
        aliases: ['!memegen'],
        category: 'Images',
        cooldownMs: 3000,
        description: 'Reply to an image with !memegen [top text] | [bottom text]',
        execute: async (ctx) => {
            const buffer = await getQuotedImageBuffer(ctx).catch(() => null);
            if (!buffer) return ctx.reply('Reply to an image with !memegen [top] | [bottom]');
            const [top, bottom] = ctx.text.slice(ctx.cmd.length).split('|').map((s) => (s || '').trim().toUpperCase());
            const out = await addCaptionBar(buffer, top, bottom);
            await ctx.sock.sendMessage(ctx.chatId, { image: out });
        },
    },
    {
        name: '!caption',
        category: 'Images',
        cooldownMs: 3000,
        description: 'Reply to an image with !caption [text] to add a bottom caption',
        execute: async (ctx) => {
            const buffer = await getQuotedImageBuffer(ctx).catch(() => null);
            if (!buffer) return ctx.reply('Reply to an image with !caption [text]');
            const text = ctx.text.slice(ctx.cmd.length).trim().toUpperCase();
            if (!text) return ctx.reply('Usage: !caption [text] (as a reply to an image)');
            const out = await addCaptionBar(buffer, null, text);
            await ctx.sock.sendMessage(ctx.chatId, { image: out });
        },
    },
    {
        name: '!enhance',
        category: 'Images',
        cooldownMs: 3000,
        description: 'Reply to an image with !enhance for a basic contrast/sharpness boost',
        execute: async (ctx) => {
            const buffer = await getQuotedImageBuffer(ctx).catch(() => null);
            if (!buffer) return ctx.reply('Reply to an image with !enhance');
            const image = await Jimp.read(buffer);
            image.contrast(0.15).color([{ apply: 'saturate', params: [15] }]);
            const out = await image.getBufferAsync(Jimp.MIME_JPEG);
            await ctx.sock.sendMessage(ctx.chatId, { image: out, caption: '✨ Enhanced' });
        },
    },
    {
        name: '!removebg',
        category: 'Images',
        cooldownMs: 5000,
        description: 'Reply to an image with !removebg (requires REMOVE_BG_API_KEY in config.js)',
        execute: async (ctx) => {
            if (!config.REMOVE_BG_API_KEY) {
                return ctx.reply('⚠️ Background removal needs a remove.bg API key set in config.js (REMOVE_BG_API_KEY).');
            }
            const buffer = await getQuotedImageBuffer(ctx).catch(() => null);
            if (!buffer) return ctx.reply('Reply to an image with !removebg');
            try {
                const form = new FormData();
                form.append('image_file', new Blob([buffer]), 'image.png');
                form.append('size', 'auto');
                const res = await fetch('https://api.remove.bg/v1.0/removebg', {
                    method: 'POST',
                    headers: { 'X-Api-Key': config.REMOVE_BG_API_KEY },
                    body: form,
                });
                if (!res.ok) return ctx.reply('❌ Background removal failed.');
                const out = Buffer.from(await res.arrayBuffer());
                await ctx.sock.sendMessage(ctx.chatId, { image: out, caption: '✂️ Background removed' });
            } catch (err) {
                await ctx.reply('❌ Background removal service unavailable.');
            }
        },
    },
];
