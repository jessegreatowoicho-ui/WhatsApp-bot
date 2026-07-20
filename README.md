# WhatsApp Bot v2

Multi-purpose Baileys bot: casino/economy, RPG, mini-games, group moderation, media, fun, utilities, and optional AI features.

## Setup

```bash
npm install
node index.js
```

Scan the QR code with WhatsApp (Linked Devices) on first run. Session data is saved to `auth_info/` so you won't need to re-scan on restart.

## Configuration

Edit `config.js` (or set matching environment variables):

| Setting | Needed for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `!ai`, `!translate`, `!summarize`, `!rewrite` | Get one at console.anthropic.com. Without it these commands reply with a clear "needs a key" message instead of crashing. |
| `REMOVE_BG_API_KEY` | `!removebg` | Get one at remove.bg. Optional. |
| `OWNERS` | `!ownermenu` and future owner-only commands | Add your own JID, e.g. `1234567890@s.whatsapp.net`. |

Everything else (weather, wikipedia, currency conversion, lyrics, search) uses free public APIs and needs no key.

## What's fully working out of the box

- **Economy**: `!balance !daily !work !beg !crime !rob !deposit !withdraw !shop !buy !inventory !achievements !leaderboard`
- **RPG**: `!rank !quest !dungeon !boss !fish !mine !farm !craft !pet !trade !guild`
- **Games**: `!ttt !rps !hangman !guess !guessnumber !emojiquiz !trivia !answer !scramble !unscramble !truth !dare`
- **Group management** (admin-only): `!antilink !antispam !antibadword !welcome !tagall !poll !mute !unmute !warn !kick`
- **Fun**: `!meme !joke !quote !fact !8ball !ship !dice !coinflip !compliment !roast`
- **Utilities**: `!weather !qr !genpass !calc !convert !time !wiki !search !remind !note`
- **Media**: `!play !video !lyrics !sticker !toimg !tts`
- **Images**: `!memegen !caption !enhance` (local, no key) and `!removebg` (needs key)
- **General**: `!menu !adminmenu !ownermenu !ping !uptime !stats`

## Important boundaries

- `!kick`/`!ban` only remove someone from **the current group** (and only if the bot itself has been made a group admin). They cannot touch a WhatsApp account outside that group, and can't be used to ban accounts platform-wide — WhatsApp itself is the only party that can do that.
- There is no account-hacking or unauthorized-access functionality in here, and none will be added — that's illegal and out of scope for this project regardless of how it's requested.
- `!antilink` / `!antibadword` / `!warn` only ever act on non-admins, so admins can't accidentally lock themselves out.

## Project layout

```
index.js              entry point, connection handling, event wiring
config.js              all tunables and API keys
lib/
  database.js          JSON persistence + cooldown helpers
  handler.js            command registry, aliasing, cooldowns, permission checks
  gameState.js          in-memory session store for mini-games
  logger.js              leveled console logging
commands/
  general.js, economy.js, rpg.js, games.js, group.js,
  fun.js, utility.js, media.js, images.js, ai.js
```

Each `commands/*.js` file exports an array of command definitions:
```js
{
  name: '!example',
  aliases: ['!ex'],
  category: 'Fun',
  cooldownMs: 2000,     // per-user cooldown, 0 to disable
  adminOnly: false,      // group admins only
  ownerOnly: false,       // OWNERS list only
  groupOnly: false,        // must be used in a group
  execute: async (ctx) => { ... },
}
```

To add a new command, drop a new object into the relevant array (or a new file, then register it in `index.js`) — no other wiring required. This is the plugin surface for future commands.

## Data

All persistent state lives in `bot_data.json` (auto-created, git-ignore it). It's a superset of the original bot's schema, so if you're upgrading from the old single-file version, your existing wallets/collections carry over unchanged — the pokemon-card-game fields still live under `data.players[jid]`.
