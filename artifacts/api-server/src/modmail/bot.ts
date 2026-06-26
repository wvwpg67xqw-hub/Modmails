import {
  Client,
  GatewayIntentBits,
  Partials,
  Message,
  ChannelType,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { handleUserDM, handleReply, handleClose, handleSub, handleMove, handleSnippetAdd, handleSnippetRemove, handleSnippetList, handleSnippetUse, handleHelp } from "./handlers.js";
import { getSnippet, listSnippets } from "./db.js";
import { ensureCategories } from "./setup.js";

const STAFF_SERVER_ID = process.env["STAFF_SERVER_ID"]!;
const MAIN_SERVER_ID = process.env["MAIN_SERVER_ID"]!;
const TOKEN = process.env["DISCORD_TOKEN"]!;

export function startBot() {
  if (!TOKEN) {
    logger.error("DISCORD_TOKEN is not set — bot will not start");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once("clientReady", async () => {
    logger.info({ tag: client.user?.tag }, "Modmail bot ready");
    logger.info({ guilds: client.guilds.cache.map(g => `${g.name}:${g.id}`) }, "Guilds in cache");

    await client.guilds.fetch();

    const staffGuild = client.guilds.cache.get(STAFF_SERVER_ID);
    if (staffGuild) {
      try {
        await staffGuild.fetch();
        await ensureCategories(staffGuild);
        logger.info("Categories ensured on staff server");
      } catch (err) {
        logger.error({ err }, "Failed to ensure categories");
      }
    } else {
      logger.error({ STAFF_SERVER_ID, available: client.guilds.cache.map(g => g.id) }, "Staff guild not found in cache after fetch");
    }
  });

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    if (message.channel.type === ChannelType.DM) {
      await handleUserDM(client, message);
      return;
    }

    if (message.guild?.id !== STAFF_SERVER_ID) return;

    const content = message.content.trim();
    const lower = content.toLowerCase();

    if (lower === ".close") {
      await handleClose(message);
      return;
    }

    if (lower === ".sub") {
      await handleSub(message);
      return;
    }

    if (lower.startsWith(".r ") || lower === ".r") {
      await handleReply(message, false);
      return;
    }

    if (lower.startsWith(".ar ") || lower === ".ar") {
      await handleReply(message, true);
      return;
    }

    if (lower.startsWith(".move ") || lower === ".move") {
      await handleMove(message);
      return;
    }

    if (lower.startsWith(".snippet add ")) {
      await handleSnippetAdd(message);
      return;
    }

    if (lower.startsWith(".snippet remove ")) {
      await handleSnippetRemove(message);
      return;
    }

    if (lower === ".snippet list" || lower === ".snippet") {
      await handleSnippetList(message);
      return;
    }

    if (lower === ".a" || lower === ".help") {
      await handleHelp(message);
      return;
    }

    if (lower.startsWith(".") && !lower.startsWith("..")) {
      const snippetName = lower.slice(1).split(/\s+/)[0];
      if (snippetName && getSnippet(snippetName)) {
        await handleSnippetUse(message, snippetName);
        return;
      }
    }
  });

  client.on("guildMemberAdd", async (member) => {
    if (member.guild.id !== MAIN_SERVER_ID) return;

    try {
      const staffGuild = await client.guilds.fetch(STAFF_SERVER_ID);
      const cats = await ensureCategories(staffGuild);
      const pojCatId = cats["Ping on Join"];

      const channel = staffGuild.channels.cache
        .find((c) => c.parentId === pojCatId && c.type === ChannelType.GuildText);

      if (channel && channel.isTextBased()) {
        await channel.send(`📥 **${member.user.tag}** (${member.user.id}) just joined the server!`);
      } else {
        const { ChannelType: CT } = await import("discord.js");
        const newChan = await staffGuild.channels.create({
          name: "join-pings",
          type: CT.GuildText,
          parent: pojCatId ?? undefined,
          topic: "Ping on Join notifications",
        });
        await newChan.send(`📥 **${member.user.tag}** (${member.user.id}) just joined the server!`);
      }
    } catch (err) {
      logger.error({ err }, "POJ ping failed");
    }
  });

  client.login(TOKEN).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
  });
}
