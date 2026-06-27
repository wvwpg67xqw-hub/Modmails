import {
  Client,
  GatewayIntentBits,
  Partials,
  Message,
  ChannelType,
  StringSelectMenuInteraction,
  ComponentType,
} from "discord.js";
import { logger } from "../lib/logger.js";
import {
  handleUserDM,
  handleCategorySelection,
  handleReply,
  handleClose,
  handleSub,
  handleMove,
  handleSnippetAdd,
  handleSnippetRemove,
  handleSnippetList,
  handleSnippetView,
  handleSnippetUse,
  handleHelp,
  handleEscalate,
  handleBlock,
  handleUnblock,
  handleMenuEdit,
  handleMenuEditSelection,
  handleMenuEditModalSubmit,
  getStaffGuild,
} from "./handlers.js";
import { getSnippet } from "./db.js";
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
      logger.error({ STAFF_SERVER_ID, available: client.guilds.cache.map(g => g.id) }, "Staff guild not found");
    }
  });

  // ── Interactions (select menus + modals) ──────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "modmail_category") {
        await handleCategorySelection(client, interaction as StringSelectMenuInteraction);
      } else if (interaction.customId === "menu_edit_select") {
        await handleMenuEditSelection(interaction as StringSelectMenuInteraction);
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("menu_edit_modal_")) {
        await handleMenuEditModalSubmit(interaction);
      }
    }
  });

  // ── Messages ───────────────────────────────────────────────────────────────
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    // DM from user → modmail flow
    if (message.channel.type === ChannelType.DM) {
      await handleUserDM(client, message);
      return;
    }

    // Only handle staff server messages
    if (message.guild?.id !== STAFF_SERVER_ID) return;

    const content = message.content.trim();
    const lower = content.toLowerCase();

    if (lower === ".close") { await handleClose(message); return; }
    if (lower === ".sub")   { await handleSub(message);   return; }

    if (lower.startsWith(".r ") || lower === ".r")   { await handleReply(message, false); return; }
    if (lower.startsWith(".ar ") || lower === ".ar") { await handleReply(message, true);  return; }

    if (lower.startsWith(".move"))             { await handleMove(message);          return; }
    if (lower.startsWith(".snippet add "))     { await handleSnippetAdd(message);    return; }
    if (lower.startsWith(".snippet remove "))  { await handleSnippetRemove(message); return; }
    if (lower === ".snippet list" || lower === ".snippet") { await handleSnippetList(message); return; }
    if (lower.startsWith(".s "))               { await handleSnippetView(message, lower.slice(3).trim()); return; }
    if (lower === ".block")                    { await handleBlock(message);         return; }
    if (lower.startsWith(".unblock"))          { await handleUnblock(message);       return; }
    if (lower === ".escalate")                 { await handleEscalate(message);      return; }
    if (lower === ".menu edit")                { await handleMenuEdit(message);      return; }
    if (lower === ".a" || lower === ".help")   { await handleHelp(message);          return; }

    // Snippet shortcut: .snippetname
    if (lower.startsWith(".") && !lower.startsWith("..")) {
      const snippetName = lower.slice(1).split(/\s+/)[0];
      if (snippetName && getSnippet(snippetName)) {
        await handleSnippetUse(message, snippetName);
        return;
      }
    }
  });

  client.login(TOKEN).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
  });
}
