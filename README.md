# Yovn System

Discord.js v14 system bot. The bot token is supplied by your hosting provider as an environment variable named `DISCORD_TOKEN`.

## Hosting
1. Upload this ZIP and extract it.
2. Select Node.js 20 or newer.
3. Run `npm install`.
4. Add environment variable `DISCORD_TOKEN` with your bot token (never put it in a public file).
5. Start command: `npm start` (or `node index.js`).
6. Enable **Message Content Intent**, **Server Members Intent**, and **Presence Intent** in the Discord Developer Portal if available.
7. Give the bot the permissions it needs: View Channels, Send Messages, Manage Messages, Manage Roles, Moderate Members, Ban Members, Kick Members, Move Members, Mute Members, View Audit Log, Embed Links, Attach Files, Read Message History.

## Important configuration
Edit `config.json` to set the guild ID, welcome artwork path, and any channel/role IDs. The IDs supplied in the project brief are prefilled where known. `config.json` contains no token.

## Notes
- Discord's bulk-delete endpoint cannot bulk-delete messages older than 14 days; the clear command handles eligible messages and reports the result.
- Private-message broadcasts can be blocked by recipients' privacy settings and are rate-limited by Discord. The bot sends gradually and reports successes/failures.
- Anti-raid is conservative: it detects bursts and alerts staff; it does not automatically ban newcomers.
- Anonymous Zajel messages are anonymous to the recipient, but staff with access to bot data/logs may be able to investigate abuse. The bot stores sender IDs to route replies and enforce blocks.
- Some Discord actions depend on the bot's role hierarchy and server permissions.
