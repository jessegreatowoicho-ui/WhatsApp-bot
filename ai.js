const config = require('../config');

async function callAI(prompt) {
    if (!config.ANTHROPIC_API_KEY) {
        throw new Error('NO_API_KEY');
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 800,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!res.ok) throw new Error(`AI_HTTP_${res.status}`);
    const data = await res.json();
    return data.content?.map((b) => b.text || '').join('\n').trim() || '(no response)';
}

function noKeyMessage(ctx) {
    return ctx.reply('⚠️ AI features need ANTHROPIC_API_KEY set in config.js (or the ANTHROPIC_API_KEY env var).');
}

module.exports = [
    {
        name: '!ai',
        aliases: ['!ask'],
        category: 'AI',
        cooldownMs: 4000,
        execute: async (ctx) => {
            const question = ctx.text.slice(ctx.cmd.length).trim();
            if (!question) return ctx.reply('Usage: !ai [question]');
            try {
                const answer = await callAI(question);
                await ctx.reply(`🤖 ${answer}`);
            } catch (err) {
                if (err.message === 'NO_API_KEY') return noKeyMessage(ctx);
                await ctx.reply('❌ AI request failed.');
            }
        },
    },
    {
        name: '!translate',
        category: 'AI',
        cooldownMs: 3000,
        description: '!translate [target language] | [text]',
        execute: async (ctx) => {
            const body = ctx.text.slice(ctx.cmd.length).trim();
            const [lang, ...rest] = body.split('|');
            const text = rest.join('|').trim();
            if (!lang || !text) return ctx.reply('Usage: !translate [target language] | [text]');
            try {
                const answer = await callAI(`Translate the following text to ${lang.trim()}. Only output the translation, nothing else:\n\n${text}`);
                await ctx.reply(`🌐 ${answer}`);
            } catch (err) {
                if (err.message === 'NO_API_KEY') return noKeyMessage(ctx);
                await ctx.reply('❌ Translation failed.');
            }
        },
    },
    {
        name: '!summarize',
        category: 'AI',
        cooldownMs: 4000,
        description: 'Reply to a long message with !summarize, or !summarize [text]',
        execute: async (ctx) => {
            const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
            const text = ctx.text.slice(ctx.cmd.length).trim() || quotedText;
            if (!text) return ctx.reply('Usage: !summarize [text], or reply to a message with !summarize');
            try {
                const answer = await callAI(`Summarize the following text in 2-4 concise sentences:\n\n${text}`);
                await ctx.reply(`📋 ${answer}`);
            } catch (err) {
                if (err.message === 'NO_API_KEY') return noKeyMessage(ctx);
                await ctx.reply('❌ Summarization failed.');
            }
        },
    },
    {
        name: '!rewrite',
        category: 'AI',
        cooldownMs: 4000,
        execute: async (ctx) => {
            const text = ctx.text.slice(ctx.cmd.length).trim();
            if (!text) return ctx.reply('Usage: !rewrite [text]');
            try {
                const answer = await callAI(`Rewrite the following text to be clearer and more polished, keeping the same meaning. Only output the rewritten text:\n\n${text}`);
                await ctx.reply(`✍️ ${answer}`);
            } catch (err) {
                if (err.message === 'NO_API_KEY') return noKeyMessage(ctx);
                await ctx.reply('❌ Rewrite failed.');
            }
        },
    },
];
