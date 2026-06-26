import {
  Client,
  Message,
  TextChannel,
  ChannelType,
  EmbedBuilder,
  Colors,
  Guild,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import {
  getThreadByUser,
  getThreadByChannel,
  createThread,
  closeThread,
  updateThread,
  addSubscriber,
  removeSubscriber,
  getSnippet,
  addSnippet,
  removeSnippet,
  listSnippets,
  setPending,
  getPending,
  clearPending,
} from "./db.js";
import { CATEGORIES, MENU_OPTIONS } from "./categories.js";
import { ensureCategories } from "./setup.js";
import { logger } from "../lib/logger.js";

const STAFF_SERVER_ID = process.env["STAFF_SERVER_ID"]!;

const STAFF_ROLES: { id: string; label: string }[] = [
  { id: "1519938887416545282", label: "Ownership" },
  { id: "1519939477303197878", label: "Bored of Directors" },
  { id: "1519940064254361660", label: "Management" },
];

async function getStaffRoleLabel(client: Client, userId: string): Promise<string> {
  try {
    const staffGuild = await getStaffGuild(client);
    if (!staffGuild) return "Staff Team";
    const member = await staffGuild.members.fetch(userId);
    for (const role of STAFF_ROLES) {
      if (member.roles.cache.has(role.id)) return role.label;
    }
  } catch { /**/ }
  return "Staff Team";
}

function threadId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getStaffGuild(client: Client): Promise<Guild | null> {
  try {
    return client.guilds.cache.get(STAFF_SERVER_ID) ?? await client.guilds.fetch(STAFF_SERVER_ID);
  } catch {
    return null;
  }
}

async function getCategoryId(guild: Guild, catName: string): Promise<string | null> {
  const cats = await ensureCategories(guild);
  return cats[catName] ?? null;
}

export async function openThread(
  client: Client,
  userId: string,
  username: string,
  avatarURL: string,
  category: string,
  initialMessage: string,
) {
  const staffGuild = await getStaffGuild(client);
  if (!staffGuild) return null;

  const catId = await getCategoryId(staffGuild, category);

  const safeName = username.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 20) || "user";
  const prefix = Object.entries(CATEGORIES).find(([, v]) => v === category)?.[0]?.toLowerCase() ?? "modmail";

  const channel = await staffGuild.channels.create({
    name: `${prefix}-${safeName}`,
    type: ChannelType.GuildText,
    parent: catId ?? undefined,
    topic: `[${category}] Thread for ${username} (${userId})`,
  });

  const tid = threadId();
  createThread({
    threadId: tid,
    channelId: channel.id,
    userId,
    username,
    open: true,
    category,
    createdAt: Date.now(),
    subscribers: [],
  });

  const openEmbed = new EmbedBuilder()
    .setTitle(`New ${category} Thread`)
    .setDescription(`Thread opened by **${username}** (${userId})`)
    .setColor(Colors.Green)
    .setTimestamp()
    .addFields(
      { name: "User ID", value: userId, inline: true },
      { name: "Category", value: category, inline: true },
    );

  await channel.send({ embeds: [openEmbed] });

  if (initialMessage) {
    const msgEmbed = new EmbedBuilder()
      .setAuthor({ name: username, iconURL: avatarURL })
      .setDescription(initialMessage)
      .setColor(Colors.Blue)
      .setTimestamp();
    await channel.send({ embeds: [msgEmbed] });
  }

  return channel;
}

export async function handleUserDM(client: Client, message: Message) {
  if (message.author.bot) return;

  const existingThread = getThreadByUser(message.author.id);

  if (existingThread) {
    const staffGuild = await getStaffGuild(client);
    if (!staffGuild) return;

    const channel = staffGuild.channels.cache.get(existingThread.channelId) as TextChannel | undefined;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content || "*[no text content]*")
      .setColor(Colors.Blue)
      .setTimestamp()
      .setFooter({ text: `User ID: ${message.author.id}` });

    if (message.attachments.size > 0) {
      embed.addFields({ name: "Attachments", value: message.attachments.map((a) => a.url).join("\n") });
    }

    await channel.send({ embeds: [embed] });

    if (existingThread.subscribers.length > 0) {
      const mentions = existingThread.subscribers.map((id) => `<@${id}>`).join(" ");
      await channel.send(`${mentions} — new reply from user`);
    }

    await message.react("✅").catch(() => {});
    return;
  }

  const pending = getPending(message.author.id);
  if (pending) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription("Please select a category from the menu above before sending a message.")
          .setColor(Colors.Yellow),
      ],
    }).catch(() => {});
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("modmail_category")
    .setPlaceholder("Choose what you need help with…")
    .addOptions(
      MENU_OPTIONS.map((opt) => ({
        label: opt.label,
        description: opt.description,
        value: opt.value,
        emoji: opt.emoji,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const menuMsg = await message.author.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("Welcome to Modmail")
        .setDescription(
          "Please select the reason you're contacting us from the menu below.\n\n" +
          MENU_OPTIONS.map((o) => `${o.emoji} **${o.label}** — ${o.description}`).join("\n")
        )
        .setColor(Colors.Blurple)
        .setFooter({ text: "Select an option to open your thread" }),
    ],
    components: [row],
  }).catch(() => null);

  if (!menuMsg) return;

  setPending(message.author.id, menuMsg.id, message.content);
}

export async function handleCategorySelection(
  client: Client,
  interaction: StringSelectMenuInteraction,
) {
  const userId = interaction.user.id;
  const chosen = interaction.values[0] as string;
  const pending = getPending(userId);

  await interaction.deferUpdate().catch(() => {});

  const disabledSelect = new StringSelectMenuBuilder()
    .setCustomId("modmail_category_done")
    .setPlaceholder(`Selected: ${chosen}`)
    .setDisabled(true)
    .addOptions(MENU_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value, emoji: opt.emoji })));

  await interaction.message.edit({ components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(disabledSelect)] }).catch(() => {});

  clearPending(userId);

  const channel = await openThread(
    client,
    userId,
    interaction.user.tag,
    interaction.user.displayAvatarURL(),
    chosen,
    pending?.initialMessage ?? "",
  );

  if (!channel) {
    await interaction.user.send("❌ Something went wrong opening your thread. Please try again.").catch(() => {});
    return;
  }

  const option = MENU_OPTIONS.find((o) => o.value === chosen);

  await interaction.user.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${option?.emoji ?? ""} Thread Opened — ${chosen}`)
        .setDescription("Your thread has been opened! Our staff team will get back to you shortly.\n\nYou can continue sending messages here and they'll be forwarded to staff.")
        .setColor(Colors.Green)
        .setTimestamp(),
    ],
  }).catch(() => {});
}

export async function handleReply(message: Message, anonymous: boolean) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) {
    await message.reply("❌ This channel is not a modmail thread.");
    return;
  }

  const client = message.client;
  let user;
  try {
    user = await client.users.fetch(thread.userId);
  } catch {
    await message.reply("❌ Could not fetch the user.");
    return;
  }

  const content = message.content.replace(/^\.ar?\s*/i, "").trim();
  if (!content) {
    await message.reply("❌ Please provide a message to send.");
    return;
  }

  const roleLabel = anonymous ? await getStaffRoleLabel(client, message.author.id) : null;

  const embed = new EmbedBuilder()
    .setDescription(content)
    .setColor(anonymous ? Colors.Grey : Colors.Green)
    .setTimestamp();

  if (anonymous) {
    embed.setAuthor({ name: roleLabel! });
  } else {
    embed.setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() });
  }

  try {
    await user.send({ embeds: [embed] });
    await message.react("✅").catch(() => {});

    const senderLabel = anonymous ? `${roleLabel} (anon)` : message.author.tag;
    const logEmbed = new EmbedBuilder()
      .setAuthor({ name: senderLabel, iconURL: anonymous ? undefined : message.author.displayAvatarURL() })
      .setDescription(`→ **User:** ${content}`)
      .setColor(anonymous ? Colors.Grey : Colors.Green)
      .setTimestamp();
    await (message.channel as TextChannel).send({ embeds: [logEmbed] });
    await message.delete().catch(() => {});
  } catch {
    await message.reply("❌ Failed to DM the user. They may have DMs disabled.");
  }
}

export async function handleClose(message: Message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) {
    await message.reply("❌ This is not a modmail thread.");
    return;
  }

  try {
    const user = await message.client.users.fetch(thread.userId);
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Thread Closed")
          .setDescription("Your modmail thread has been closed by our staff team. Feel free to DM again if you need further assistance.")
          .setColor(Colors.Red),
      ],
    }).catch(() => {});
  } catch { /**/ }

  closeThread(thread.threadId);

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setDescription(`🔒 Thread closed by **${message.author.tag}**`)
        .setColor(Colors.Red),
    ],
  });

  setTimeout(async () => {
    await (message.channel as TextChannel).delete().catch(() => {});
  }, 5000);
}

export async function handleSub(message: Message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) {
    await message.reply("❌ This is not a modmail thread.");
    return;
  }

  if (thread.subscribers.includes(message.author.id)) {
    removeSubscriber(message.channel.id, message.author.id);
    await message.reply("🔕 Unsubscribed from this thread.");
  } else {
    addSubscriber(message.channel.id, message.author.id);
    await message.reply("🔔 Subscribed! You'll be pinged on new user messages.");
  }
}

export async function handleMove(message: Message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) {
    await message.reply("❌ This is not a modmail thread.");
    return;
  }

  const target = message.content.replace(/^\.move\s*/i, "").trim();
  if (!target) {
    await message.reply(`❌ Usage: \`.move <category>\`. Available: ${Object.values(CATEGORIES).join(", ")}`);
    return;
  }

  const staffGuild = await getStaffGuild(message.client);
  if (!staffGuild) return;

  const catMatch = Object.values(CATEGORIES).find((c) => c.toLowerCase() === target.toLowerCase());
  if (!catMatch) {
    await message.reply(`❌ Unknown category \`${target}\`. Available: ${Object.values(CATEGORIES).join(", ")}`);
    return;
  }

  const cats = await ensureCategories(staffGuild);
  const catId = cats[catMatch];
  if (!catId) {
    await message.reply("❌ Could not find that category on the server.");
    return;
  }

  await (message.channel as TextChannel).setParent(catId, { lockPermissions: false });
  updateThread(thread.threadId, { category: catMatch });
  await message.reply(`✅ Moved to **${catMatch}**`);
}

export async function handleSnippetAdd(message: Message) {
  const rest = message.content.replace(/^\.snippet\s+add\s*/i, "").trim();
  const spaceIdx = rest.indexOf(" ");
  if (spaceIdx === -1) {
    await message.reply("❌ Usage: `.snippet add <name> <content>`");
    return;
  }
  const name = rest.slice(0, spaceIdx).toLowerCase();
  const content = rest.slice(spaceIdx + 1).trim();
  addSnippet(name, content);
  await message.reply(`✅ Snippet \`${name}\` saved.`);
}

export async function handleSnippetRemove(message: Message) {
  const name = message.content.replace(/^\.snippet\s+remove\s*/i, "").trim().toLowerCase();
  if (!name) {
    await message.reply("❌ Usage: `.snippet remove <name>`");
    return;
  }
  const removed = removeSnippet(name);
  await message.reply(removed ? `✅ Snippet \`${name}\` removed.` : `❌ No snippet named \`${name}\`.`);
}

export async function handleSnippetList(message: Message) {
  const snippets = listSnippets();
  if (snippets.length === 0) {
    await message.reply("No snippets saved yet. Add one with `.snippet add <name> <content>`.");
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle("Snippets")
    .setColor(Colors.Blurple)
    .setDescription(snippets.map((s) => `**\`${s.name}\`** — ${s.content}`).join("\n"));
  await message.reply({ embeds: [embed] });
}

export async function handleSnippetUse(message: Message, snippetName: string) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) {
    await message.reply("❌ This is not a modmail thread.");
    return;
  }

  const snippet = getSnippet(snippetName);
  if (!snippet) {
    await message.reply(`❌ No snippet named \`${snippetName}\`.`);
    return;
  }

  let user;
  try {
    user = await message.client.users.fetch(thread.userId);
  } catch {
    await message.reply("❌ Could not fetch the user.");
    return;
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(snippet.content)
    .setColor(Colors.Green)
    .setTimestamp();

  await user.send({ embeds: [embed] });
  await message.react("✅").catch(() => {});

  const logEmbed = new EmbedBuilder()
    .setDescription(`**${message.author.tag}** → User (snippet \`${snippetName}\`): ${snippet.content}`)
    .setColor(Colors.Green)
    .setTimestamp();
  await (message.channel as TextChannel).send({ embeds: [logEmbed] });
  await message.delete().catch(() => {});
}

export async function handleHelp(message: Message) {
  const snippets = listSnippets();
  const snippetLines = snippets.length > 0
    ? snippets.map((s) => `**.${s.name}** — ${s.content}`).join("\n")
    : "*No snippets saved yet.*";

  const embed = new EmbedBuilder()
    .setTitle("Modmail Commands")
    .setColor(Colors.Blurple)
    .addFields(
      { name: "📬 Replying", value: "`.r <message>` — Reply to user\n`.ar <message>` — Anonymous reply" },
      { name: "🔧 Thread Management", value: "`.close` — Close thread\n`.sub` — Toggle subscription pings\n`.move <category>` — Move thread" },
      { name: "📝 Snippets", value: "`.snippet add <name> <text>` — Create\n`.snippet remove <name>` — Delete\n`.snippet list` — List all\n`.<name>` — Send snippet to user" },
      { name: "📋 Saved Snippets", value: snippetLines },
      { name: "ℹ️ Categories", value: Object.values(CATEGORIES).join(", ") },
    )
    .setFooter({ text: "Modmail Bot" });

  await message.reply({ embeds: [embed] });
}
