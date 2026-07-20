module.exports = {
    PREFIX: '!',

    // JIDs (phone@s.whatsapp.net) of bot owners - unlocks owner-only commands
    OWNERS: [
        // '1234567890@s.whatsapp.net',
    ],

    // ---------- API keys (leave blank to disable that feature) ----------
    // Used by !ai, !summarize, !rewrite, !translate
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

    // Used by !removebg (background removal) - https://www.remove.bg/api
    REMOVE_BG_API_KEY: process.env.REMOVE_BG_API_KEY || '',

    // ---------- Economy tuning ----------
    STARTING_BALANCE: 1000,
    DAILY_AMOUNT: 500,
    DAILY_COOLDOWN_MS: 24 * 60 * 60 * 1000,
    WORK_COOLDOWN_MS: 60 * 60 * 1000,
    WORK_MIN: 50,
    WORK_MAX: 300,
    BEG_COOLDOWN_MS: 15 * 60 * 1000,
    BEG_MIN: 10,
    BEG_MAX: 100,
    CRIME_COOLDOWN_MS: 45 * 60 * 1000,
    CRIME_MIN: 100,
    CRIME_MAX: 500,
    CRIME_FAIL_CHANCE: 0.45,
    CRIME_FAIL_PENALTY: 150,
    ROB_COOLDOWN_MS: 2 * 60 * 60 * 1000,
    ROB_SUCCESS_CHANCE: 0.4,
    ROB_MIN_TARGET_BALANCE: 200,
    ROB_STEAL_PCT: 0.25,

    // ---------- RPG tuning ----------
    XP_PER_LEVEL: 100,
    FISH_COOLDOWN_MS: 20 * 60 * 1000,
    MINE_COOLDOWN_MS: 25 * 60 * 1000,
    FARM_COOLDOWN_MS: 30 * 60 * 1000,
    DUNGEON_COOLDOWN_MS: 60 * 60 * 1000,
    BOSS_COOLDOWN_MS: 3 * 60 * 60 * 1000,
    QUEST_COOLDOWN_MS: 24 * 60 * 60 * 1000,

    // ---------- Misc ----------
    DEFAULT_COMMAND_COOLDOWN_MS: 3000,
    DATA_FILE: 'bot_data.json',
};
