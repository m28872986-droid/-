const {
  Client, GatewayIntentBits, Partials, ChannelType, PermissionsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const CATEGORY_ID = "1565013714489442305";
const WAITING_ROOM_ID = "1565013900116623360";
const REQUEST_PANEL_CHANNEL_ID = "1565013801407873085";
const DB_PATH = path.join(__dirname, "rooms.json");

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN environment variable.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

let db = { rooms: {}, requests: {} };
try {
  if (fs.existsSync(DB_PATH)) db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
} catch (e) {
  console.error("Could not read rooms.json:", e);
}
db.rooms ||= {};
db.requests ||= {};

function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function roomFor(channelId) {
  return Object.values(db.rooms).find(r => r.channelId === channelId);
}
function memberIsInRoom(member, room) {
  return member?.voice?.channelId === room.channelId;
}
function isOwner(member, room) {
  return room.ownerId === member.id;
}
function embed(title, description, color = 0x5865F2) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
}
function controlPanel(room) {
  const e = embed("🎙️ التحكم بالروم الخاص", `**المالك الحالي:** <@${room.ownerId}>\\n**الروم:** <#${room.channelId}>\\n\\nاستخدم الأزرار للتحكم برومك.`);
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("room:limit").setLabel("حد الروم").setEmoji("👥").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("room:rename").setLabel("تغيير الاسم").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("room:transfer").setLabel("نقل الملكية").setEmoji("👑").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("room:lock").setLabel("قفل الروم").setEmoji("🔒").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("room:unlock").setLabel("فتح الروم").setEmoji("🔓").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("room:allow").setLabel("السماح").setEmoji("➕").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("room:deny").setLabel("منع").setEmoji("🚫").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("room:kick").setLabel("طرد عضو").setEmoji("👢").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("room:mute").setLabel("ميوت").setEmoji("🔇").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("room:unmute").setLabel("فك ميوت").setEmoji("🎙️").setStyle(ButtonStyle.Secondary)
    )
  ];
  return { embeds: [e], components: rows };
}
async function sendControlPanel(channel, room) {
  try {
    await channel.send(controlPanel(room));
  } catch (e) {
    console.error("Could not send room control panel. Check bot permissions for voice-channel chat:", e.message);
  }
}
async function refreshPanel(channel, room) {
  // A fresh panel is sent after ownership changes so the current owner is clearly shown.
  await sendControlPanel(channel, room);
}
async function getTextChannel(guild, id) {
  const ch = await guild.channels.fetch(id).catch(() => null);
  return ch?.isTextBased() ? ch : null;
}
function addToQueue(room, userId) {
  room.queue ||= [];
  room.queue = room.queue.filter(id => id !== userId);
  room.queue.push(userId);
}
async function setOwner(guild, room, userId) {
  room.ownerId = userId;
  const channel = await guild.channels.fetch(room.channelId).catch(() => null);
  if (channel) {
    await channel.permissionOverwrites.edit(userId, {
      ViewChannel: true, Connect: true, Speak: true, SendMessages: true, ReadMessageHistory: true
    }).catch(() => {});
    await refreshPanel(channel, room);
  }
  saveDB();
}
async function nextOwner(guild, room) {
  const channel = await guild.channels.fetch(room.channelId).catch(() => null);
  if (!channel) return;
  const connected = channel.members;
  const next = (room.queue || []).find(id => connected.has(id));
  if (next) {
    await setOwner(guild, room, next);
    const text = await guild.channels.fetch(room.channelId).catch(() => null);
    if (text?.isTextBased()) await text.send(`👑 انتقلت ملكية الروم إلى <@${next}> تلقائيًا.`);
  } else if (connected.size === 0) {
    await channel.delete("Private room is empty").catch(() => {});
    delete db.rooms[room.channelId];
    saveDB();
  }
}
async function createRoom(member) {
  const guild = member.guild;
  const category = await guild.channels.fetch(CATEGORY_ID).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    console.error("Configured category was not found or is not a category.");
    return;
  }
  const roomChannel = await guild.channels.create({
    name: member.user.username.slice(0, 100),
    type: ChannelType.GuildVoice,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
      { id: member.id, allow: [
        PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.MuteMembers
      ] }
    ]
  });
  db.rooms[roomChannel.id] = {
    channelId: roomChannel.id, guildId: guild.id, ownerId: member.id,
    queue: [member.id], createdAt: Date.now(), panelSent: false
  };
  saveDB();
  await member.voice.setChannel(roomChannel).catch(async e => {
    console.error("Could not move member to new room:", e.message);
    await roomChannel.delete().catch(() => {});
    delete db.rooms[roomChannel.id];
    saveDB();
  });
  await sendControlPanel(roomChannel, db.rooms[roomChannel.id]);
  db.rooms[roomChannel.id].panelSent = true;
  saveDB();
}
async function showRequestPanel() {
  for (const guild of client.guilds.cache.values()) {
    const ch = await getTextChannel(guild, REQUEST_PANEL_CHANNEL_ID);
    if (!ch) continue;
    const messages = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    const exists = messages?.some(m => m.author.id === client.user.id && m.embeds[0]?.title === "🚪 طلب دخول روم خاص");
    if (!exists) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("requests:open").setLabel("طلب دخول روم").setEmoji("🚪").setStyle(ButtonStyle.Primary)
      );
      await ch.send({
        embeds: [embed("🚪 طلب دخول روم خاص", "اضغط الزر واختر الروم الذي ترغب بالدخول إليه. سيرسل طلبك إلى مالك الروم.")],
        components: [row]
      }).catch(console.error);
    }
  }
}
function requestSelect(guild) {
  const rooms = Object.values(db.rooms).filter(r => r.guildId === guild.id);
  const options = rooms.slice(0, 25).map(r => ({
    label: ` ${guild.channels.cache.get(r.channelId)?.name || "روم خاص"}`.trim().slice(0, 100),
    description: `المالك: ${guild.members.cache.get(r.ownerId)?.user.username || r.ownerId}`.slice(0, 100),
    value: r.channelId
  }));
  return options;
}
function modalWithInput(customId, title, label, placeholder) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const input = new TextInputBuilder().setCustomId("value").setLabel(label)
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder(placeholder);
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}
async function requireRoomOwner(interaction) {
  const room = roomFor(interaction.channelId);
  if (!room) {
    await interaction.reply({ content: "هذا الشات غير مرتبط بروم خاص.", ephemeral: true });
    return null;
  }
  if (!isOwner(interaction.member, room) || !memberIsInRoom(interaction.member, room)) {
    await interaction.reply({ content: "لوحة التحكم متاحة لمالك الروم الحالي الموجود داخله فقط.", ephemeral: true });
    return null;
  }
  return room;
}
async function memberFromInput(guild, value) {
  const id = value.replace(/[<@!>]/g, "");
  if (!/^\\d{17,20}$/.test(id)) return null;
  return guild.members.fetch(id).catch(() => null);
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await showRequestPanel();
  // Restore missing request panel after restarts; voice-room panels remain in their channels.
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    if (newState.channelId === WAITING_ROOM_ID && oldState.channelId !== WAITING_ROOM_ID) {
      // Avoid creating a second room if this user already owns one.
      const existing = Object.values(db.rooms).find(r => r.guildId === newState.guild.id && r.ownerId === newState.id);
      if (!existing) await createRoom(newState.member);
      else {
        const ch = await newState.guild.channels.fetch(existing.channelId).catch(() => null);
        if (ch) await newState.member.voice.setChannel(ch).catch(() => {});
      }
    }
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      const room = db.rooms[oldState.channelId];
      if (room) {
        room.queue ||= [];
        room.queue = room.queue.filter(id => id !== oldState.id);
        if (room.ownerId === oldState.id) await nextOwner(oldState.guild, room);
        else {
          const channel = await oldState.guild.channels.fetch(room.channelId).catch(() => null);
          if (channel && channel.members.size === 0) {
            await channel.delete("Private room is empty").catch(() => {});
            delete db.rooms[room.channelId];
          }
          saveDB();
        }
      }
    }
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      const room = db.rooms[newState.channelId];
      if (room && !room.queue.includes(newState.id)) {
        addToQueue(room, newState.id);
        saveDB();
      }
    }
  } catch (e) { console.error("voiceStateUpdate error:", e); }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "requests:open") {
        const options = requestSelect(interaction.guild);
        if (!options.length) return interaction.reply({ content: "ما فيه رومات خاصة متاحة حاليًا.", ephemeral: true });
        const menu = new StringSelectMenuBuilder().setCustomId("requests:choose").setPlaceholder("اختر الروم وصاحبه").addOptions(options);
        return interaction.reply({ content: "اختر الروم الذي تريد طلب الدخول إليه:", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }
      if (interaction.customId.startsWith("request:")) {
        const [, action, requesterId] = interaction.customId.split(":");
        const req = db.requests[requesterId];
        if (!req) return interaction.reply({ content: "انتهى هذا الطلب أو لم يعد موجودًا.", ephemeral: true });
        const room = db.rooms[req.channelId];
        if (!room || room.ownerId !== interaction.user.id) return interaction.reply({ content: "هذا الطلب لم يعد عند مالك الروم الحالي.", ephemeral: true });
        const guild = interaction.guild;
        const requester = await guild.members.fetch(requesterId).catch(() => null);
        const roomChannel = await guild.channels.fetch(req.channelId).catch(() => null);
        if (!requester || !roomChannel) return interaction.reply({ content: "العضو أو الروم لم يعد متاحًا.", ephemeral: true });
        if (action === "accept") {
          await roomChannel.permissionOverwrites.edit(requesterId, { ViewChannel: true, Connect: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
          await interaction.update({ content: `✅ تم قبول طلب <@${requesterId}>.`, embeds: [], components: [] });
          await requester.send(`✅ تم قبول طلبك لدخول روم <#${req.channelId}>.`).catch(() => {});
        } else {
          await interaction.update({ content: `❌ تم رفض طلب <@${requesterId}>.`, embeds: [], components: [] });
          await requester.send("❌ تم رفض طلب دخول الروم الخاص.").catch(() => {});
        }
        delete db.requests[requesterId];
        saveDB();
        return;
      }
      if (!interaction.customId.startsWith("room:")) return;
      const room = await requireRoomOwner(interaction);
      if (!room) return;
      const action = interaction.customId.split(":")[1];
      if (action === "lock" || action === "unlock") {
        const everyone = interaction.guild.roles.everyone.id;
        await interaction.channel.permissionOverwrites.edit(everyone, action === "lock" ? {
          Connect: false,
          ViewChannel: false
        } : {
          Connect: true,
          ViewChannel: true
        });
        return interaction.reply({ content: action === "lock" ? "🔒 تم قفل الروم." : "🔓 تم فتح الروم للأعضاء المسموح لهم.", ephemeral: true });
      }
      const modalConfig = {
        limit: ["تحديد حد الروم", "الحد الأقصى للأعضاء", "اكتب رقمًا من 0 إلى 99"],
        rename: ["تغيير اسم الروم", "الاسم الجديد", "اكتب اسم الروم"],
        transfer: ["نقل ملكية الروم", "آيدي أو منشن العضو", "مثال: 123456789012345678"],
        allow: ["السماح لعضو", "آيدي أو منشن العضو", "العضو الذي تريد السماح له"],
        deny: ["منع عضو", "آيدي أو منشن العضو", "العضو الذي تريد منعه"],
        kick: ["طرد عضو", "آيدي أو منشن العضو", "العضو الذي تريد طرده"],
        mute: ["ميوت عضو", "آيدي أو منشن العضو", "العضو الذي تريد كتمه"],
        unmute: ["فك ميوت عضو", "آيدي أو منشن العضو", "العضو الذي تريد فك كتمه"]
      };
      const [title, label, placeholder] = modalConfig[action];
      return interaction.showModal(modalWithInput(`roommodal:${action}`, title, label, placeholder));
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "requests:choose") {
      const channelId = interaction.values[0];
      const room = db.rooms[channelId];
      if (!room) return interaction.reply({ content: "هذا الروم لم يعد متاحًا.", ephemeral: true });
      if (room.ownerId === interaction.user.id) return interaction.reply({ content: "هذا رومك أنت.", ephemeral: true });
      const owner = await interaction.guild.members.fetch(room.ownerId).catch(() => null);
      if (!owner) return interaction.reply({ content: "مالك الروم غير متاح حاليًا.", ephemeral: true });
      const roomChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      const ownerChat = roomChannel;
      const requestId = interaction.user.id;
      db.requests[requestId] = { channelId, requesterId: requestId, createdAt: Date.now() };
      saveDB();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`request:accept:${requestId}`).setLabel("قبول").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`request:reject:${requestId}`).setLabel("رفض").setEmoji("❌").setStyle(ButtonStyle.Danger)
      );
      await ownerChat.send({ embeds: [embed("🚪 طلب دخول جديد", `العضو: <@${requestId}>\\nيرغب بالدخول إلى رومك الخاص.`)], components: [row] }).catch(() => {});
      return interaction.reply({ content: `✅ تم إرسال طلبك إلى <@${room.ownerId}>.`, ephemeral: true });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("roommodal:")) {
      const action = interaction.customId.split(":")[1];
      const room = roomFor(interaction.channelId);
      if (!room || room.ownerId !== interaction.user.id || !interaction.member.voice?.channelId || interaction.member.voice.channelId !== room.channelId) {
        return interaction.reply({ content: "أنت لست مالك الروم الحالي الموجود داخله.", ephemeral: true });
      }
      const value = interaction.fields.getTextInputValue("value").trim();
      if (action === "limit") {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 99) return interaction.reply({ content: "اكتب رقمًا صحيحًا من 0 إلى 99.", ephemeral: true });
        await interaction.channel.setUserLimit(n);
        return interaction.reply({ content: `✅ تم تحديد حد الروم إلى ${n === 0 ? "مفتوح" : n + " أعضاء"}.`, ephemeral: true });
      }
      if (action === "rename") {
        await interaction.channel.setName(value.slice(0, 100));
        return interaction.reply({ content: "✅ تم تغيير اسم الروم.", ephemeral: true });
      }
      const target = await memberFromInput(interaction.guild, value);
      if (!target) return interaction.reply({ content: "ما قدرت ألقى العضو. استخدم منشن أو آيدي صحيح.", ephemeral: true });
      if (action === "transfer") {
        if (!target.voice.channelId || target.voice.channelId !== room.channelId) return interaction.reply({ content: "لازم يكون العضو داخل رومك.", ephemeral: true });
        addToQueue(room, target.id);
        await setOwner(interaction.guild, room, target.id);
        return interaction.reply({ content: `👑 تم نقل ملكية الروم إلى ${target}.`, ephemeral: true });
      }
      if (action === "allow") {
        await interaction.channel.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: true, SendMessages: true, ReadMessageHistory: true });
        return interaction.reply({ content: `✅ تم السماح لـ ${target} بدخول الروم.`, ephemeral: true });
      }
      if (action === "deny") {
        await interaction.channel.permissionOverwrites.edit(target.id, { ViewChannel: false, Connect: false, SendMessages: false });
        if (target.voice.channelId === room.channelId) await target.voice.disconnect().catch(() => {});
        return interaction.reply({ content: `🚫 تم منع ${target} من الروم.`, ephemeral: true });
      }
      if (action === "kick") {
        if (target.voice.channelId !== room.channelId) return interaction.reply({ content: "العضو ليس داخل رومك.", ephemeral: true });
        await target.voice.disconnect().catch(() => {});
        return interaction.reply({ content: `👢 تم طرد ${target} من الروم.`, ephemeral: true });
      }
      if (action === "mute" || action === "unmute") {
        if (target.voice.channelId !== room.channelId) return interaction.reply({ content: "العضو ليس داخل رومك.", ephemeral: true });
        await target.voice.setMute(action === "mute").catch(() => {});
        return interaction.reply({ content: action === "mute" ? `🔇 تم عمل ميوت لـ ${target}.` : `🎙️ تم فك الميوت عن ${target}.`, ephemeral: true });
      }
    }
  } catch (e) {
    console.error("interaction error:", e);
    const msg = { content: "حدث خطأ أثناء تنفيذ العملية. تأكد من صلاحيات البوت.", ephemeral: true };
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply(msg).catch(() => {});
  }
});

client.login(TOKEN);
