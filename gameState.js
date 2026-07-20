// In-memory only - games don't need to survive a restart.
// Keyed by chatId so one game runs at a time per chat.
const sessions = new Map();

module.exports = {
    get: (chatId) => sessions.get(chatId),
    set: (chatId, session) => sessions.set(chatId, session),
    clear: (chatId) => sessions.delete(chatId),
    has: (chatId) => sessions.has(chatId),
};
