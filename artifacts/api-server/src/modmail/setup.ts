import { Guild, ChannelType, PermissionFlagsBits } from "discord.js";
import { AUTO_CATEGORIES } from "./categories.js";
import { logger } from "../lib/logger.js";

export async function ensureCategories(guild: Guild): Promise<Record<string, string>> {
  const categoryIds: Record<string, string> = {};

  for (const catName of AUTO_CATEGORIES) {
    let existing = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === catName
    );

    if (!existing) {
      try {
        existing = await guild.channels.create({
          name: catName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: [PermissionFlagsBits.ViewChannel],
            },
          ],
        });
        logger.info({ catName }, "Created category");
      } catch (err) {
        logger.error({ err, catName }, "Failed to create category");
        continue;
      }
    }

    categoryIds[catName] = existing.id;
  }

  return categoryIds;
}
