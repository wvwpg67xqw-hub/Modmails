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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
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
  isBlocked,
  blockUser,
  unblockUser,
  getMenuOptions,
  updateMenuOption,
  addMenuOption,
} from "./db.js";
import { CATEGORIES } from "./categories.js";
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
  overrideCategoryId?: string | null,
) {
  const staffGuild = await getStaffGuild(client);
  if (!staffGuild) return null;

  const catId = overrideCategoryId ?? await getCategoryId(staffGuild, category);

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

  if (isBlocked(message.author.id)) return;

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

    const mentions = existingThread.subscribers.length > 0
      ? existingThread.subscribers.map((id) => `<@${id}>`).join(" ")
      : undefined;

    await channel.send({ content: mentions, embeds: [embed] });

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

  const menuOpts = getMenuOptions();

  const select = new StringSelectMenuBuilder()
    .setCustomId("modmail_category")
    .setPlaceholder("Choose what you need help with…")
    .addOptions(
      menuOpts.map((opt) => ({
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
          menuOpts.map((o) => `${o.emoji} **${o.label}** — ${o.description}`).join("\n")
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

  const allOpts = getMenuOptions();
  const disabledSelect = new StringSelectMenuBuilder()
    .setCustomId("modmail_category_done")
    .setPlaceholder(`Selected: ${chosen}`)
    .setDisabled(true)
    .addOptions(allOpts.map((opt) => ({ label: opt.label, value: opt.value, emoji: opt.emoji })));

  await interaction.message.edit({ components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(disabledSelect)] }).catch(() => {});

  clearPending(userId);

  const chosenOption = allOpts.find((o) => o.value === chosen);

  const channel = await openThread(
    client,
    userId,
    interaction.user.tag,
    interaction.user.displayAvatarURL(),
    chosen,
    pending?.initialMessage ?? "",
    chosenOption?.categoryId,
  );

  if (!channel) {
    await interaction.user.send("❌ Something went wrong opening your thread. Please try again.").catch(() => {});
    return;
  }

  const option = chosenOption;

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

  // Accept a raw Discord category/channel ID (snowflake) directly
  const isSnowflake = /^\d{17,20}$/.test(target);
  if (isSnowflake) {
    try {
      await (message.channel as TextChannel).setParent(target, { lockPermissions: false });
      updateThread(thread.threadId, { category: `Channel ${target}` });
      await message.reply(`✅ Moved to category \`${target}\``);
    } catch {
      await message.reply("❌ Could not move to that channel ID. Make sure it's a valid category ID on this server.");
    }
    return;
  }

  const catMatch = Object.values(CATEGORIES).find((c) => c.toLowerCase() === target.toLowerCase());
  if (!catMatch) {
    await message.reply(`❌ Unknown category \`${target}\`. Available: ${Object.values(CATEGORIES).join(", ")} or a raw category channel ID`);
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

export async function handleSnippetView(message: Message, name: string) {
  const snippet = getSnippet(name);
  if (!snippet) {
    await message.reply(`❌ No snippet named \`${name}\`.`);
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle(`📋 Snippet: ${snippet.name}`)
    .setDescription(snippet.content)
    .setColor(Colors.Blurple)
    .setFooter({ text: `Use .${snippet.name} to send this to the user` });
  await message.reply({ embeds: [embed] });
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

export async function handleMenuEdit(message: Message) {
  const opts = getMenuOptions();
  const select = new StringSelectMenuBuilder()
    .setCustomId("menu_edit_select")
    .setPlaceholder("Choose an option to edit, or add a new one…")
    .addOptions([
      ...opts.map((o) => ({ label: o.label, value: o.value, emoji: o.emoji, description: `Edit: ${o.description}` })),
      { label: "➕ Add New Option", value: "__add_new__", description: "Add a brand new option to the user menu" },
    ]);

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🛠️ Edit Menu")
        .setDescription(
          "**Current options:**\n" +
          opts.map((o, i) => `${i + 1}. ${o.emoji} **${o.label}** — ${o.description}`).join("\n") +
          "\n\nSelect an option to edit it, or choose **➕ Add New Option** to create one."
        )
        .setColor(Colors.Blurple),
    ],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });
}

export async function handleMenuEditSelection(interaction: StringSelectMenuInteraction) {
  const value = interaction.values[0]!;

  if (value === "__add_new__") {
    const modal = new ModalBuilder()
      .setCustomId("menu_edit_modal___add_new__")
      .setTitle("Add New Menu Option");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("label").setLabel("Label (shown to users)").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Bug Report").setRequired(true).setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("description").setLabel("Description (shown under label)").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Report a bug or issue").setRequired(true).setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (e.g. 🐛)").setStyle(TextInputStyle.Short).setPlaceholder("🐛").setRequired(true).setMaxLength(32),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("categoryId").setLabel("Category Channel ID (blank = auto by name)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20),
      ),
    );

    await interaction.showModal(modal);
    return;
  }

  const opts = getMenuOptions();
  const opt = opts.find((o) => o.value === value);
  if (!opt) { await interaction.reply({ content: "❌ Option not found.", ephemeral: true }); return; }

  const modal = new ModalBuilder()
    .setCustomId(`menu_edit_modal_${value}`)
    .setTitle(`Edit: ${opt.label}`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("label").setLabel("Label (shown to users)").setStyle(TextInputStyle.Short).setValue(opt.label).setRequired(true).setMaxLength(100),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("description").setLabel("Description (shown under label)").setStyle(TextInputStyle.Short).setValue(opt.description).setRequired(true).setMaxLength(100),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (e.g. 📬 or :envelope:)").setStyle(TextInputStyle.Short).setValue(opt.emoji).setRequired(true).setMaxLength(32),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("categoryId").setLabel("Category Channel ID (blank = auto by name)").setStyle(TextInputStyle.Short).setValue(opt.categoryId ?? "").setRequired(false).setMaxLength(20),
    ),
  );

  await interaction.showModal(modal);
}

export async function handleMenuEditModalSubmit(interaction: ModalSubmitInteraction) {
  const value = interaction.customId.replace("menu_edit_modal_", "");
  const label = interaction.fields.getTextInputValue("label").trim();
  const description = interaction.fields.getTextInputValue("description").trim();
  const emoji = interaction.fields.getTextInputValue("emoji").trim();
  const categoryIdRaw = interaction.fields.getTextInputValue("categoryId").trim();
  const categoryId = categoryIdRaw || null;

  const isNew = value === "__add_new__";

  if (isNew) {
    const slug = label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `option-${Date.now()}`;
    addMenuOption({ value: slug, label, description, emoji, categoryId });
  } else {
    updateMenuOption(value, { label, description, emoji, categoryId });
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(isNew ? "✅ Menu Option Added" : "✅ Menu Option Updated")
        .setColor(Colors.Green)
        .addFields(
          { name: "Label", value: label, inline: true },
          { name: "Emoji", value: emoji, inline: true },
          { name: "Description", value: description, inline: false },
          { name: "Category ID", value: categoryId ?? "*Auto (matched by name)*", inline: false },
        )
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}

export async function handleBlock(message: Message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) {
    await message.reply("❌ This is not a modmail thread.");
    return;
  }

  if (isBlocked(thread.userId)) {
    await message.reply(`⚠️ **${thread.username}** is already blocked.`);
    return;
  }

  blockUser(thread.userId);

  const embed = new EmbedBuilder()
    .setTitle("🚫 User Blocked")
    .setDescription(`**${thread.username}** (\`${thread.userId}\`) has been blocked from sending modmail.`)
    .setColor(Colors.Red)
    .setTimestamp()
    .setFooter({ text: `Blocked by ${message.author.tag}` });

  await (message.channel as TextChannel).send({ embeds: [embed] });
  await message.delete().catch(() => {});
}

export async function handleUnblock(message: Message) {
  const target = message.content.replace(/^\.unblock\s*/i, "").trim();

  if (!target) {
    await message.reply("❌ Usage: `.unblock <user ID>`");
    return;
  }

  const userId = target.replace(/\D/g, "");
  if (!userId) {
    await message.reply("❌ Please provide a valid user ID.");
    return;
  }

  const removed = unblockUser(userId);

  const embed = new EmbedBuilder()
    .setColor(removed ? Colors.Green : Colors.Grey)
    .setDescription(
      removed
        ? `✅ User \`${userId}\` has been unblocked and can now send modmail again.`
        : `⚠️ User \`${userId}\` was not on the blocklist.`
    )
    .setTimestamp()
    .setFooter({ text: `By ${message.author.tag}` });

  await message.reply({ embeds: [embed] });
}

export async function handleEscalate(message: Message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) {
    await message.reply("❌ This is not a modmail thread.");
    return;
  }

  const BOD_ROLE_ID = "1519939477303197878";

  const embed = new EmbedBuilder()
    .setTitle("⚠️ Thread Escalated")
    .setDescription(`This thread has been escalated by **${message.author.tag}** and requires Bored of Directors attention.`)
    .setColor(Colors.Orange)
    .setTimestamp()
    .addFields(
      { name: "Thread", value: `#${(message.channel as TextChannel).name}`, inline: true },
      { name: "User", value: `${thread.username} (${thread.userId})`, inline: true },
      { name: "Category", value: thread.category, inline: true },
    );

  await (message.channel as TextChannel).send({
    content: `<@&${BOD_ROLE_ID}>`,
    embeds: [embed],
  });

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
      { name: "🔧 Thread Management", value: "`.close` — Close thread\n`.sub` — Toggle subscription pings\n`.move <category>` — Move thread\n`.escalate` — Ping Bored of Directors\n`.block` — Block user from modmail\n`.unblock <user ID>` — Unblock a user" },
      { name: "📝 Snippets", value: "`.snippet add <name> <text>` — Create\n`.snippet remove <name>` — Delete\n`.snippet list` — List all\n`.<name>` — Send snippet to user" },
      { name: "📋 Saved Snippets", value: snippetLines },
      { name: "ℹ️ Categories", value: Object.values(CATEGORIES).join(", ") },
    )
    .setFooter({ text: "Modmail Bot" });

  await message.reply({ embeds: [embed] });
}
