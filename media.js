const path = require('path');
const fs = require('fs');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const googleTTS = require('google-tts-api');

const TMP_DIR = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

async function downloadAudio(query) {
    const results = await yts(query);
    const video = results.videos?.[0];
    if (!video) return null;
    const safeName = video.title.replace(/[^a-z0-9]/gi, '_').slice(0, 50);
    const filePath = path.join(TMP_DIR, `${safeName}_${Date.now()}.mp3`);
    await new Promise((resolve, reject) => {
        const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
        const ws = fs.createWriteStream(filePath);
        stream.pipe(ws);
        ws.on('finish', resolve);
        stream.on('error', reject);
        ws.on('error', reject);
    });
    return { title: video.title, filePath, url: video.url };
}

module.exports = [
    {
        name: '!play',
        category: 'Media',
        cooldownMs: 5000,
        description: '!play [song name] - search + send audio',
        execute: async (ctx) => {
            const query = ctx.text.slice(ctx.cmd.length).trim();
            if (!query) return ctx.reply('Usage: !play [song name]');
            await ctx.reply(`🔎 Searching for "${query}"...`);
            try {
                const result = await downloadAudio(query);
                if (!result) return ctx.reply('❌ Could not find that song.');
                await ctx.sock.sendMessage(ctx.chatId, {
                    audio: { url: result.filePath },
                    mimetype: 'audio/mp4',
                    fileName: `${result.title}.mp3`,
                });
                fs.unlink(result.filePath, () => {});
            } catch (err) {
                await ctx.reply('❌ Something went wrong fetching that song.');
            }
        },
    },
    {
        name: '!video',
        category: 'Media',
        cooldownMs: 8000,
        description: '!video [name] - search + send a video (may be large/slow)',
        execute: async (ctx) => {
            const query = ctx.text.slice(ctx.cmd.length).trim();
            if (!query) return ctx.reply('Usage: !video [video name]');
            const results = await yts(query);
            const video = results.videos?.[0];
            if (!video) return ctx.reply('❌ Could not find that video.');
            await ctx.reply(`⬇️ Downloading "${video.title}"... this can take a while for longer videos.`);
            const safeName = video.title.replace(/[^a-z0-9]/gi, '_').slice(0, 50);
            const filePath = path.join(TMP_DIR, `${safeName}_${Date.now()}.mp4`);
            try {
                await new Promise((resolve, reject) => {
                    const stream = ytdl(video.url, { filter: 'audioandvideo', quality: 'lowest' });
                    const ws = fs.createWriteStream(filePath);
                    stream.pipe(ws);
                    ws.on('finish', resolve);
                    stream.on('error', reject);
                    ws.on('error', reject);
                });
                await ctx.sock.sendMessage(ctx.chatId, { video: { url: filePath }, caption: video.title });
            } catch (err) {
                await ctx.reply('❌ Video download failed.');
            } finally {
                fs.unlink(filePath, () => {});
            }
        },
    },
    {
        name: '!lyrics',
        category: 'Media',
        cooldownMs: 3000,
        description: 'Uses the free lyrics.ovh API (no key needed)',
        execute: async (ctx) => {
            const query = ctx.text.slice(ctx.cmd.length).trim();
            if (!query) return ctx.reply('Usage: !lyrics [artist - song, or just song name]');
            const [artist, ...rest] = query.split('-').map((s) => s.trim());
            const title = rest.join('-').trim() || artist;
            const searchArtist = rest.length ? artist : '';
            try {
                let res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(searchArtist || 'unknown')}/${encodeURIComponent(title)}`);
                let data = await res.json();
                if (!data.lyrics) {
                    // fall back: treat whole query as the title with no artist
                    const s = await yts(query);
                    const guess = s.videos?.[0]?.author?.name;
                    if (guess) {
                        res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(guess)}/${encodeURIComponent(query)}`);
                        data = await res.json();
                    }
                }
                if (!data.lyrics) return ctx.reply('❌ Lyrics not found.');
                const trimmed = data.lyrics.length > 3500 ? data.lyrics.slice(0, 3500) + '\n...(truncated)' : data.lyrics;
                await ctx.reply(`🎤 *${query}*\n\n${trimmed}`);
            } catch (err) {
                await ctx.reply('❌ Lyrics service unavailable.');
            }
        },
    },
    {
        name: '!sticker',
        aliases: ['!s'],
        category: 'Media',
        cooldownMs: 2000,
        description: 'Reply to an image/video with !sticker to convert it',
        execute: async (ctx) => {
            const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const target = quoted || ctx.msg.message;
            const mediaMsg = target?.imageMessage || target?.videoMessage;
            if (!mediaMsg) return ctx.reply('Reply to an image or short video with !sticker');
            try {
                const buffer = await ctx.downloadQuotedMedia();
                const sticker = new Sticker(buffer, {
                    pack: 'My Bot',
                    author: 'WhatsApp Bot',
                    type: StickerTypes.FULL,
                    quality: 70,
                });
                await ctx.sock.sendMessage(ctx.chatId, await sticker.toMessage());
            } catch (err) {
                await ctx.reply('❌ Could not create sticker from that.');
            }
        },
    },
    {
        name: '!toimg',
        category: 'Media',
        cooldownMs: 2000,
        description: 'Reply to a sticker with !toimg to convert it to an image',
        execute: async (ctx) => {
            const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted?.stickerMessage) return ctx.reply('Reply to a sticker with !toimg');
            try {
                const buffer = await ctx.downloadQuotedMedia();
                await ctx.sock.sendMessage(ctx.chatId, { image: buffer });
            } catch (err) {
                await ctx.reply('❌ Could not convert that sticker.');
            }
        },
    },
    {
        name: '!tts',
        category: 'Media',
        cooldownMs: 3000,
        description: '!tts [text] - text to speech (short text works best)',
        execute: async (ctx) => {
            const text = ctx.text.slice(ctx.cmd.length).trim();
            if (!text) return ctx.reply('Usage: !tts [text]');
            if (text.length > 200) return ctx.reply('Keep it under 200 characters please.');
            try {
                const url = googleTTS.getAudioUrl(text, { lang: 'en', slow: false, host: 'https://translate.google.com' });
                await ctx.sock.sendMessage(ctx.chatId, { audio: { url }, mimetype: 'audio/mp4', ptt: true });
            } catch (err) {
                await ctx.reply('❌ TTS failed.');
            }
        },
    },
];
