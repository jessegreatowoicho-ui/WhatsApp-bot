const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function timestamp() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(level, ...args) {
    if (LEVELS[level] > CURRENT_LEVEL) return;
    const tag = { error: '❌ ERROR', warn: '⚠️  WARN', info: 'ℹ️  INFO', debug: '🔍 DEBUG' }[level];
    console.log(`[${timestamp()}] ${tag}:`, ...args);
}

module.exports = {
    error: (...a) => log('error', ...a),
    warn: (...a) => log('warn', ...a),
    info: (...a) => log('info', ...a),
    debug: (...a) => log('debug', ...a),
};
