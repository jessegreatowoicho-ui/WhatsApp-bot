const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('./logger');

const DATA_PATH = path.join(__dirname, '..', config.DATA_FILE);

const DEFAULT_SHAPE = {
    wallets: {},
    bank: {},
    inventory: {},
    daily: {},
    work: {},
    beg: {},
    crime: {},
    rob: {},
    cooldowns: {},
    achievements: {},
    notes: {},
    reminders: [],
    groupSettings: {},
    players: {},   // legacy pokemon-card-game state (collection/deck/hand/active/prizes)
    rpg: {},       // xp/level/pets/guild/quests
    guilds: {},
};

let data = { ...DEFAULT_SHAPE };

function load() {
    if (fs.existsSync(DATA_PATH)) {
        try {
            const loaded = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
            data = { ...DEFAULT_SHAPE, ...loaded };
        } catch (err) {
            logger.error('Failed to parse data file, starting fresh:', err.message);
        }
    }
}
load();

let saveScheduled = false;
function save() {
    // Debounce writes so bursts of commands don't hammer the disk.
    if (saveScheduled) return;
    saveScheduled = true;
    setTimeout(() => {
        saveScheduled = false;
        try {
            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
        } catch (err) {
            logger.error('Failed to save data:', err.message);
        }
    }, 250);
}

// ---------- generic helpers ----------
function ensurePlayer(jid) {
    if (data.wallets[jid] === undefined) data.wallets[jid] = config.STARTING_BALANCE;
    if (data.bank[jid] === undefined) data.bank[jid] = 0;
    if (!data.inventory[jid]) data.inventory[jid] = {};
    if (!data.players[jid]) data.players[jid] = { collection: [] };
    if (!data.rpg[jid]) {
        data.rpg[jid] = { xp: 0, level: 1, hp: 100, maxHp: 100, pet: null, guild: null, quests: {} };
    }
    if (!data.achievements[jid]) data.achievements[jid] = [];
    if (!data.notes[jid]) data.notes[jid] = [];
}

function addItem(jid, item, qty = 1) {
    ensurePlayer(jid);
    data.inventory[jid][item] = (data.inventory[jid][item] || 0) + qty;
    save();
}

function removeItem(jid, item, qty = 1) {
    ensurePlayer(jid);
    const have = data.inventory[jid][item] || 0;
    if (have < qty) return false;
    data.inventory[jid][item] = have - qty;
    if (data.inventory[jid][item] <= 0) delete data.inventory[jid][item];
    save();
    return true;
}

function grantAchievement(jid, name) {
    ensurePlayer(jid);
    if (!data.achievements[jid].includes(name)) {
        data.achievements[jid].push(name);
        save();
        return true; // newly earned
    }
    return false;
}

// Generic cooldown store keyed by "command:jid". Returns ms remaining (0 = ready).
function getCooldownRemaining(key, jid, cooldownMs) {
    const stamp = data.cooldowns[`${key}:${jid}`];
    if (!stamp) return 0;
    const remaining = cooldownMs - (Date.now() - stamp);
    return remaining > 0 ? remaining : 0;
}

function setCooldown(key, jid) {
    data.cooldowns[`${key}:${jid}`] = Date.now();
    save();
}

module.exports = {
    data,
    save,
    ensurePlayer,
    addItem,
    removeItem,
    grantAchievement,
    getCooldownRemaining,
    setCooldown,
};
