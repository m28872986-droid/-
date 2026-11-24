# Yovn Private Rooms Bot

## Files
- `index.js` — bot code
- `package.json` — dependencies and start command
- `rooms.json` — room and request data (created automatically)

## Hosting
1. Upload the files to your hosting provider.
2. Set the environment variable `DISCORD_TOKEN` to your Discord bot token in the host's Variables / Environment settings.
3. Install dependencies with `npm install`.
4. Start with `npm start`.

## Configured channel IDs
- Category: `1565013714489442305`
- Voice waiting room: `1565013900116623360`
- Join-request panel channel: `1565013801407873085`

## Discord Developer Portal
Enable these privileged intents:
- Server Members Intent

The bot uses Guilds, GuildMembers, and GuildVoiceStates intents.

## Required bot permissions
Give the bot:
- View Channels
- Manage Channels
- Manage Roles (to edit channel permission overwrites)
- Move Members
- Mute Members
- Send Messages
- Read Message History
- Use Application Commands is not required for this version

Place the bot role high enough in the role list to manage the needed channel overwrites and members.

## How it works
- Joining the waiting voice channel creates a private voice channel under the configured category and moves the member into it.
- The room name uses the Discord username.
- A control panel is sent in the voice channel's chat.
- The request panel is automatically posted in the configured text channel if one is not already present.
- The room owner can accept or reject join requests. Accepted users receive channel access.
- When the owner leaves, ownership passes to the earliest remaining member in the room's current join order. Returning owners do not automatically regain ownership.
- Empty rooms are deleted.

## Notes
- The bot host must provide persistent storage for `rooms.json`; otherwise saved room ownership and request data may be lost after redeploy/restart.
- Discord voice-channel chat availability and send permissions depend on server/channel configuration.
- The room list in the request menu displays up to 25 active rooms, as required by Discord select menus.
- This starter implementation should be tested in a private test category before production use.
