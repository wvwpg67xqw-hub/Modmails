import {
  Client,
  Message,
  TextChannel,
  ChannelType,
  EmbedBuilder,
  Colors,
  Guild,
  PermissionFlagsBits,
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
} from "./db.js";
import { CATEGORIES } from "./categories.js";
import { ensureCategories } from "./setup.js";
import { logger } from "../lib/logger.js";

const STAFF_SERVER_ID = process.env["STAFF_SERVER_ID"]!;

function threadId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getStaffGuild(client: Client): Promise<Guild | null> {
  try {
    return await client.guilds.fetch(STAFF_SERVER_ID);
  } catch {
    return null;
  }
}

async function getCategoryId(guild: Guild, catName: string): Promise<string | null> {
  const cats = await ensureCategories(guild);
  return cats[catName] ?? null;
}

export async function handleUserDM(client: Client, message: Message) {
  if (message.author.bot) return;

  const existingThread = getThreadByUser(message.author.id);
  const staffGuild = await getStaffGuild(client);
  if (!staffGuild) return;

  if (existingThread) {
    const channel = staffGuild.channels.cache.get(existingThread.channelId) as TextChannel | undefined;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content || "*[no text content]*")
      .setColor(Colors.Blue)
      .setTimestamp()
      .setFooter({ text: `User ID: ${message.author.id}` });

    if (message.attachments.size > 0) {
      const urls = message.attachments.map((a) => a.url).join("\n");
      embed.addFields({ name: "Attachments", value: urls });
    }

    await channel.send({ embeds: [embed] });

    if (existingThread.subscribers.length > 0) {
      const mentions = existingThread.subscribers.map((id) => `<@${id}>`).join(" ");
      await channel.send(`${mentions} — new reply from user`);
    }

    await message.react("✅").catch(() => {});
  } else {
    const catId = await getCategoryId(staffGuild, CATEGORIES.MODMAIL);
    const channel = await staffGuild.channels.create({
      name: `modmail-${message.author.username}`,
      type: ChannelType.GuildText,
      parent: catId ?? undefined,
      topic: `Modmail thread for ${message.author.tag} (${message.author.id})`,
    });

    const tid = threadId();
    createThread({
      threadId: tid,
      channelId: channel.id,
      userId: message.author.id,
      username: message.author.tag,
      open: true,
      category: CATEGORIES.MODMAIL,
      createdAt: Date.now(),
      subscribers: [],
    });

    const openEmbed = new EmbedBuilder()
      .setTitle("New Modmail Thread")
      .setDescription(`Thread opened by **${message.author.tag}** (${message.author.id})`)
      .setColor(Colors.Green)
      .setTimestamp()
      .addFields({ name: "User ID", value: message.author.id, inline: true });

    await channel.send({ embeds: [openEmbed] });

    const msgEmbed = new EmbedBuilder()
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content || "*[no text content]*")
      .setColor(Colors.Blue)
      .setTimestamp();

    if (message.attachments.size > 0) {
      const urls = message.attachments.map((a) => a.url).join("\n");
      msgEmbed.addFields({ name: "Attachments", value: urls });
    }

    await channel.send({ embeds: [msgEmbed] });
    await message.react("✅").catch(() => {});

    await message.author.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Modmail Thread Opened")
          .setDescription("Thanks for reaching out! Our staff team will get back to you shortly.")
          .setColor(Colors.Green),
      ],
    }).catch(() => {});
  }
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

  const embed = new EmbedBuilder()
    .setDescription(content)
    .setColor(anonymous ? Colors.Grey : Colors.Green)
    .setTimestamp();

  if (anonymous) {
    embed.setAuthor({ name: "Staff Team" });
  } else {
    embed.setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    });
  }

  try {
    await user.send({ embeds: [embed] });
    await message.react("✅").catch(() => {});

    const logEmbed = new EmbedBuilder()
      .setDescription(`**${anonymous ? "Anonymous" : message.author.tag}** → User: ${content}`)
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

  const client = message.client;
  try {
    const user = await client.users.fetch(thread.userId);
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

  const parts = message.content.split(/\s+/);
  const target = parts.slice(1).join(" ").trim();

  if (!target) {
    await message.reply(
      `❌ Please specify a category. Available: ${Object.values(CATEGORIES).join(", ")}`
    );
    return;
  }

  const staffGuild = await getStaffGuild(message.client);
  if (!staffGuild) return;

  const catMatch = Object.values(CATEGORIES).find(
    (c) => c.toLowerCase() === target.toLowerCase()
  );

  if (!catMatch) {
    await message.reply(
      `❌ Unknown category \`${target}\`. Available: ${Object.values(CATEGORIES).join(", ")}`
    );
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
  if (removed) {
    await message.reply(`✅ Snippet \`${name}\` removed.`);
  } else {
    await message.reply(`❌ No snippet named \`${name}\`.`);
  }
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

  const client = message.client;
  let user;
  try {
    user = await client.users.fetch(thread.userId);
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
    ? snippets.map((s) => `\`.<snippetname>\` → **.${s.name}** — sends snippet to user`).join("\n")
    : "*No snippets saved yet.*";

  const embed = new EmbedBuilder()
    .setTitle("Modmail Commands")
    .setColor(Colors.Blurple)
    .addFields(
      {
        name: "📬 Replying",
        value: [
          "`.r <message>` — Reply to user",
          "`.ar <message>` — Anonymous reply to user",
        ].join("\n"),
      },
      {
        name: "🔧 Thread Management",
        value: [
          "`.close` — Close the thread (notifies user)",
          "`.sub` — Subscribe/unsubscribe to be pinged on new user replies",
          "`.move <category>` — Move to a category (Modmail, Partnerships, Appeals, Ping on Join)",
        ].join("\n"),
      },
      {
        name: "📝 Snippets",
        value: [
          "`.snippet add <name> <content>` — Create a snippet",
          "`.snippet remove <name>` — Delete a snippet",
          "`.snippet list` — List all snippets",
          "**Using a snippet:** `.<name>` — Sends the snippet to the user",
        ].join("\n"),
      },
      {
        name: "📋 Saved Snippets",
        value: snippetLines,
      },
      {
        name: "ℹ️ Categories",
        value: Object.values(CATEGORIES).join(", "),
      }
    )
    .setFooter({ text: "Modmail Bot" });

  await message.reply({ embeds: [embed] });
}
