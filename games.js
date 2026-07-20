const gameState = require('../lib/gameState');

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------- static content banks ----------
const HANGMAN_WORDS = ['javascript', 'python', 'baileys', 'whatsapp', 'developer', 'keyboard', 'internet'];
const EMOJI_QUIZ = [
    { emoji: '🍿🎬', answer: 'movie' },
    { emoji: '🔥🚒', answer: 'fire truck' },
    { emoji: '🌙⭐', answer: 'night' },
    { emoji: '🍕🇮🇹', answer: 'pizza' },
    { emoji: '☕📖', answer: 'coffee and book' },
];
const TRIVIA = [
    { q: 'What is the capital of Japan?', a: 'tokyo' },
    { q: 'How many continents are there?', a: '7' },
    { q: 'What planet is known as the Red Planet?', a: 'mars' },
    { q: 'What is the largest ocean on Earth?', a: 'pacific' },
    { q: 'Who wrote Romeo and Juliet?', a: 'shakespeare' },
];
const SCRAMBLE_WORDS = ['elephant', 'computer', 'mountain', 'birthday', 'sandwich', 'umbrella'];
const TRUTHS = [
    "What's a habit you're trying to break?",
    "What's the last lie you told?",
    "What's your biggest fear?",
    "What's something you've never told anyone here?",
];
const DARES = [
    'Send a voice note singing your favorite song.',
    'Text your crush "hi" right now.',
    'Post the last photo in your gallery.',
    'Type only in emojis for the next 5 minutes.',
];

function scramble(word) {
    const arr = word.split('');
    for (let i = arr.length - 1; i > 0; i--) {
        const j = rand(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
}

function maskWord(word, guessed) {
    return word.split('').map((c) => (guessed.has(c) ? c : '_')).join(' ');
}

module.exports = [
    {
        name: '!ttt',
        aliases: ['!tictactoe'],
        category: 'Games',
        cooldownMs: 1000,
        description: '!ttt @opponent to start, then !ttt [1-9] to play a cell',
        execute: async (ctx) => {
            const existing = gameState.get(ctx.chatId);
            if (existing?.type === 'ttt' && /^[1-9]$/.test(ctx.args[0] || '')) {
                const game = existing;
                const cellIndex = parseInt(ctx.args[0], 10) - 1;
                if (ctx.from !== game.turn) return ctx.reply("It's not your turn.");
                if (game.board[cellIndex] !== null) return ctx.reply('That cell is taken.');
                game.board[cellIndex] = game.turn === game.playerX ? 'X' : 'O';

                const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                const b = game.board;
                const winner = wins.find(([a, b2, c]) => b[a] && b[a] === b[b2] && b[a] === b[c]);
                const boardText = b.map((v, i) => v || (i + 1)).reduce((s, v, i) => s + v + (i % 3 === 2 ? '\n' : ' | '), '');

                if (winner) {
                    gameState.clear(ctx.chatId);
                    await ctx.reply(`${boardText}\n🎉 ${ctx.mentionText(game.turn)} wins!`, [game.turn]);
                    return;
                }
                if (b.every((c) => c !== null)) {
                    gameState.clear(ctx.chatId);
                    await ctx.reply(`${boardText}\n🤝 It's a draw!`);
                    return;
                }
                game.turn = game.turn === game.playerX ? game.playerO : game.playerX;
                await ctx.reply(`${boardText}\nTurn: ${ctx.mentionText(game.turn)}`, [game.turn]);
                return;
            }

            const opponent = ctx.mentioned[0];
            if (!opponent) return ctx.reply('Usage: !ttt @opponent');
            gameState.set(ctx.chatId, {
                type: 'ttt',
                board: Array(9).fill(null),
                playerX: ctx.from,
                playerO: opponent,
                turn: ctx.from,
            });
            await ctx.reply(
                `❌⭕ Tic Tac Toe started!\n${ctx.mentionText(ctx.from)} (X) vs ${ctx.mentionText(opponent)} (O)\n` +
                `1 | 2 | 3\n4 | 5 | 6\n7 | 8 | 9\nPlay with !ttt [1-9]. ${ctx.mentionText(ctx.from)} goes first.`,
                [ctx.from, opponent]
            );
        },
    },
    {
        name: '!rps',
        category: 'Games',
        cooldownMs: 1000,
        description: '!rps [rock|paper|scissors]',
        execute: async (ctx) => {
            const choices = ['rock', 'paper', 'scissors'];
            const userChoice = ctx.args[0]?.toLowerCase();
            if (!choices.includes(userChoice)) return ctx.reply('Usage: !rps [rock|paper|scissors]');
            const botChoice = choices[rand(0, 2)];
            let result;
            if (userChoice === botChoice) result = "🤝 It's a tie!";
            else if (
                (userChoice === 'rock' && botChoice === 'scissors') ||
                (userChoice === 'paper' && botChoice === 'rock') ||
                (userChoice === 'scissors' && botChoice === 'paper')
            ) result = '🎉 You win!';
            else result = '😢 I win!';
            await ctx.reply(`You: ${userChoice}\nMe: ${botChoice}\n${result}`);
        },
    },
    {
        name: '!hangman',
        category: 'Games',
        cooldownMs: 1000,
        description: '!hangman to start, then !guess [letter]',
        execute: async (ctx) => {
            const word = HANGMAN_WORDS[rand(0, HANGMAN_WORDS.length - 1)];
            gameState.set(ctx.chatId, { type: 'hangman', word, guessed: new Set(), wrong: 0, maxWrong: 6 });
            await ctx.reply(`🔤 Hangman started! ${maskWord(word, new Set())}\nGuess letters with !guess [letter]`);
        },
    },
    {
        name: '!guess',
        category: 'Games',
        cooldownMs: 500,
        description: 'Guess a letter (hangman) or a number (guess-the-number)',
        execute: async (ctx) => {
            const game = gameState.get(ctx.chatId);
            if (!game || (game.type !== 'hangman' && game.type !== 'guessnumber')) {
                return ctx.reply('No active game here. Start one with !hangman or !guessnumber.');
            }
            if (game.type === 'hangman') {
                const letter = ctx.args[0]?.toLowerCase();
                if (!letter || letter.length !== 1) return ctx.reply('Usage: !guess [single letter]');
                game.guessed.add(letter);
                if (!game.word.includes(letter)) game.wrong++;
                const masked = maskWord(game.word, game.guessed);
                if (!masked.includes('_')) {
                    gameState.clear(ctx.chatId);
                    return ctx.reply(`🎉 Solved! The word was "${game.word}"`);
                }
                if (game.wrong >= game.maxWrong) {
                    gameState.clear(ctx.chatId);
                    return ctx.reply(`💀 Out of guesses! The word was "${game.word}"`);
                }
                await ctx.reply(`${masked}\nWrong guesses: ${game.wrong}/${game.maxWrong}`);
            } else {
                const guess = parseInt(ctx.args[0], 10);
                if (Number.isNaN(guess)) return ctx.reply('Usage: !guess [number]');
                game.attempts++;
                if (guess === game.target) {
                    gameState.clear(ctx.chatId);
                    return ctx.reply(`🎉 Correct! It was ${game.target} (${game.attempts} attempts)`);
                }
                await ctx.reply(guess < game.target ? '📈 Higher!' : '📉 Lower!');
            }
        },
    },
    {
        name: '!guessnumber',
        category: 'Games',
        cooldownMs: 1000,
        description: 'Starts a 1-100 guess-the-number game, then use !guess [number]',
        execute: async (ctx) => {
            gameState.set(ctx.chatId, { type: 'guessnumber', target: rand(1, 100), attempts: 0 });
            await ctx.reply("🔢 I'm thinking of a number between 1-100. Guess with !guess [number]");
        },
    },
    {
        name: '!emojiquiz',
        category: 'Games',
        cooldownMs: 1000,
        execute: async (ctx) => {
            const puzzle = EMOJI_QUIZ[rand(0, EMOJI_QUIZ.length - 1)];
            gameState.set(ctx.chatId, { type: 'emojiquiz', answer: puzzle.answer });
            await ctx.reply(`${puzzle.emoji}\nGuess with !answer [your answer]`);
        },
    },
    {
        name: '!trivia',
        category: 'Games',
        cooldownMs: 1000,
        execute: async (ctx) => {
            const q = TRIVIA[rand(0, TRIVIA.length - 1)];
            gameState.set(ctx.chatId, { type: 'trivia', answer: q.a });
            await ctx.reply(`❓ ${q.q}\nAnswer with !answer [your answer]`);
        },
    },
    {
        name: '!answer',
        category: 'Games',
        cooldownMs: 500,
        description: 'Answer the active trivia or emoji quiz',
        execute: async (ctx) => {
            const game = gameState.get(ctx.chatId);
            if (!game || (game.type !== 'trivia' && game.type !== 'emojiquiz')) {
                return ctx.reply('No active trivia/emoji quiz here.');
            }
            const guess = ctx.args.join(' ').toLowerCase().trim();
            if (guess === game.answer.toLowerCase()) {
                gameState.clear(ctx.chatId);
                await ctx.reply(`🎉 Correct, ${ctx.mentionText(ctx.from)}!`, [ctx.from]);
            } else {
                await ctx.reply('❌ Not quite, try again!');
            }
        },
    },
    {
        name: '!scramble',
        category: 'Games',
        cooldownMs: 1000,
        execute: async (ctx) => {
            const word = SCRAMBLE_WORDS[rand(0, SCRAMBLE_WORDS.length - 1)];
            gameState.set(ctx.chatId, { type: 'scramble', word });
            await ctx.reply(`🔀 Unscramble this: *${scramble(word)}*\nAnswer with !unscramble [word]`);
        },
    },
    {
        name: '!unscramble',
        category: 'Games',
        cooldownMs: 500,
        execute: async (ctx) => {
            const game = gameState.get(ctx.chatId);
            if (!game || game.type !== 'scramble') return ctx.reply('No active scramble game here.');
            if ((ctx.args[0] || '').toLowerCase() === game.word) {
                gameState.clear(ctx.chatId);
                await ctx.reply(`🎉 Correct, it was "${game.word}"!`);
            } else {
                await ctx.reply('❌ Nope, try again!');
            }
        },
    },
    {
        name: '!truth',
        category: 'Games',
        cooldownMs: 2000,
        execute: async (ctx) => ctx.reply(`🤔 Truth: ${TRUTHS[rand(0, TRUTHS.length - 1)]}`),
    },
    {
        name: '!dare',
        category: 'Games',
        cooldownMs: 2000,
        execute: async (ctx) => ctx.reply(`😈 Dare: ${DARES[rand(0, DARES.length - 1)]}`),
    },
];
