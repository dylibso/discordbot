import { AttachmentBuilder, ChannelType, ChatInputCommandInteraction, Client, CommandInteraction, GatewayIntentBits, GuildTextBasedChannel, PermissionFlagsBits, PermissionsBitField, REST, Routes, SlashCommandBuilder } from 'discord.js';
import safe from 'safe-regex';

import { DISCORD_BOT_TOKEN, DISCORD_BOT_CLIENT_ID, DISCORD_GUILD_FILTER, DISCORD_PLUGIN_COMMAND, DISCORD_MANAGE_COMMAND } from './config';
import { findUserByUsername, getXtpData, registerUser } from './domain/users';
import { addHandlerToChannel, executeHandlers, fetchByContentInterest, fetchByMessageIdInterest, listHandlers, registerMessageContentInterest, removeHandlerFromChannel, setHandlerAllowedHosts } from './domain/interests';
import { getLogger } from './logger';
import { getBorderCharacters, table } from 'table';
import pokemon from 'pokemon';
import { fetchLastInvocation } from './domain/invocations';

type Logger = ReturnType<typeof getLogger>

export async function startDiscordClient(logger: Logger) {
  if (!DISCORD_BOT_TOKEN) {
    return;
  }

  const rest = new REST({ version: '9' }).setToken(DISCORD_BOT_TOKEN);
  await refreshCommands(rest, logger);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on('ready', () => {
    logger.info({ tag: client.user!.tag }, `Logged in!`);
  });

  client.on('messageCreate', async message => {
    if (message.author.id === client.user!.id) {
      return;
    }

    const guild = message.guild || { name: "", id: "" };

    if (message.channel.type !== ChannelType.GuildText) {
      logger.info(`skipping message; channel type was not GuildText`)
      return
    }

    if (DISCORD_GUILD_FILTER.size && !DISCORD_GUILD_FILTER.has(guild.name)) {
      logger.info({ got: guild.name, valid: [...DISCORD_GUILD_FILTER].join('", "') }, `skipping message; not in guild filter`)
      return
    }

    logger.info({ guild: guild.name, channel: message.channel.name, content: message.content }, `Incoming message`);
    const handlers = await fetchByContentInterest({ guild: guild.id, channel: message.channel.name, content: message.content });
    await executeHandlers(client, handlers, {
      channel: message.channel.name,
      guild: guild.id,
      kind: 'content',
      message: {
        id: message.id,
        content: message.content,
        author: message.author.username,
        reference: message.reference?.messageId
      }
    }, {}, message.channel.name)

    if (message.reference === null || !message.reference.messageId) {
      return
    }

    const id = message.reference.messageId
    const messageIdInterests = await fetchByMessageIdInterest({ guild: guild.id, channel: message.channel.name, id })
    await executeHandlers(client, messageIdInterests, {
      channel: message.channel.name,
      guild: guild.id,
      kind: 'watch:reference',
      message: {
        id: message.id,
        content: message.content,
        author: message.author.username,
        reference: id,
      }
    }, {}, message.channel.name)

  });

  client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.message.channel.type !== ChannelType.GuildText) {
      logger.info(`skipping message; channel type was not GuildText`)
      return
    }

    if (user.id === client.user!.id) {
      return;
    }

    const guild = reaction.message.guild || { name: "", id: "" };

    if (reaction.message.channel.type !== ChannelType.GuildText) {
      logger.info(`skipping message; channel type was not GuildText`)
      return
    }

    if (DISCORD_GUILD_FILTER.size && !DISCORD_GUILD_FILTER.has(guild.name)) {
      logger.info({ got: guild.name, valid: [...DISCORD_GUILD_FILTER].join('", "') }, `skipping message; not in guild filter`)
      return
    }

    const handlers = await fetchByMessageIdInterest({
      guild: guild.id,
      channel: reaction.message.channel.name,
      id: reaction.message.id
    })
    await executeHandlers(client, handlers, {
      channel: reaction.message.channel.name,
      guild: guild.id,
      kind: 'watch:reaction:added',
      reaction: {
        message: {
          id: reaction.message.id,
          content: reaction.message.content,
          author: reaction.message.author?.username,
        },
        from: user.username,
        with: reaction.emoji,
      }
    }, {}, reaction.message.channel.name)
  })

  client.on('messageReactionRemove', async (reaction, user) => {
    if (reaction.message.channel.type !== ChannelType.GuildText) {
      logger.info(`skipping message; channel type was not GuildText`)
      return
    }

    if (user.id === client.user!.id) {
      return;
    }

    const guild = reaction.message.guild || { name: "", id: "" };

    if (reaction.message.channel.type !== ChannelType.GuildText) {
      logger.info(`skipping message; channel type was not GuildText`)
      return
    }

    if (DISCORD_GUILD_FILTER.size && !DISCORD_GUILD_FILTER.has(guild.name)) {
      logger.info(`skipping message; not in guild filter (got="${guild.name}"; valid="${[...DISCORD_GUILD_FILTER].join('", "')}")`)
      return
    }

    const handlers = await fetchByMessageIdInterest({
      guild: guild.id,
      channel: reaction.message.channel.name,
      id: reaction.message.id
    })
    await executeHandlers(client, handlers, {
      channel: reaction.message.channel.name,
      guild: guild.id,
      kind: 'watch:reaction:removed',
      reaction: {
        message: {
          id: reaction.message.id,
          content: reaction.message.content,
          author: reaction.message.author?.username,
        },
        from: user.username,
        with: reaction.emoji,
      }
    }, {}, reaction.message.channel.name)
  })

  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) {
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (!interaction.inGuild) {
      return;
    }
    const command = interaction;
    logger.info({
      command: command.commandName,
      subcommand: command.options.getSubcommand()
    }, `handle command`)

    if (command.commandName === DISCORD_MANAGE_COMMAND) {
      switch (command.options.getSubcommand()) {
        default: break;

        case 'invite': {
          const plugin = command.options.getString('plugin')
          const channel = command.options.getChannel('channel') || command.channel

          if (!plugin) {
            await command.reply({ content: "Plugin name is required", ephemeral: true })
          }

          if (!channel || channel.type !== ChannelType.GuildText) {
            await command.reply({ content: "Could not infer channel name", ephemeral: true })
          }

          const [username, pluginName] = plugin!.split(':')
          if (!pluginName) {
            return await command.reply({ content: `Could not parse bot name. Use \`username:botname\` form; see \`/${DISCORD_MANAGE_COMMAND} list\`.`, ephemeral: true })
          }

          const channels = await addHandlerToChannel(username, pluginName, command.guild!.id, (channel as GuildTextBasedChannel).name)

          if (!channels) {
            return await command.reply({ content: `Couldn't find a plugin by that name, sorry!`, ephemeral: true })
          }

          return await command.reply({ content: `\`${plugin}\` is now a member of \`${channels.join(", ")}\``, ephemeral: true })
        }

        case 'kick': {
          const plugin = command.options.getString('plugin')
          const channel = command.options.getChannel('channel') || command.channel

          if (!plugin) {
            return await command.reply({ content: "Plugin name is required", ephemeral: true })
          }

          if (!channel || channel.type !== ChannelType.GuildText) {
            return await command.reply({ content: "Could not infer channel name", ephemeral: true })
          }

          const [username, pluginName] = plugin!.split(':')
          if (!pluginName) {
            return await command.reply({ content: `Could not parse bot name. Use \`username:botname\` form; see \`/${DISCORD_MANAGE_COMMAND} list\`.`, ephemeral: true })
          }

          const channelName = (channel as GuildTextBasedChannel).name
          const channels = await removeHandlerFromChannel(username, pluginName, command.guild!.id, channelName)

          if (!channels) {
            return await command.reply({ content: `Couldn't find a plugin by that name, sorry!`, ephemeral: true })
          }

          return await command.reply({ content: `\`${plugin}\` is no longer a member of \`${channelName}\``, ephemeral: true })
        }

        case 'list': {
          const plugins = await listHandlers(command.guild!.id)
          const output = table([
            ['name', 'tokens per min', 'allowed channels', 'allowed hosts'],
            ...plugins.map(xs => {
              return [`${xs.username}:${xs.pluginName}`, `${xs.ratelimitingMaxTokens} (${xs.lifetimeCost} all-time)`, xs.allowedChannels.join(','), xs.allowedHosts.join(', ')]
            })], {
            border: getBorderCharacters('void'),
            columnDefault: {
              paddingLeft: 0,
              paddingRight: 1
            },
            drawHorizontalLine: () => false
          })

          return await command.reply({
            ephemeral: true,
            content: `${'```'}${output}${'```'}`
          })
        }

        case 'set-allowed-hosts': {
          const plugin = command.options.getString('plugin')
          const hosts = command.options.getString('hosts')

          if (!plugin) {
            return await command.reply({ content: "Plugin name is required", ephemeral: true })
          }

          const [username, pluginName] = plugin!.split(':')
          if (!pluginName) {
            return await command.reply({ content: `Could not parse bot name. Use \`username:botname\` form; see \`/${DISCORD_MANAGE_COMMAND} list\`.`, ephemeral: true })
          }

          const hostList = (hosts || '').split(',')

          const allowedHosts = await setHandlerAllowedHosts(username, pluginName, command.guild!.id, hostList)

          if (!allowedHosts) {
            return await command.reply({ content: `Couldn't find a plugin by that name, sorry!`, ephemeral: true })
          }
          return await command.reply({
            content: (
              allowedHosts.length
                ? `\`${plugin}\` can make requests to \`${allowedHosts.join(", ")}\``
                : `\`${plugin}\` has no network access`
            ),
            ephemeral: true
          })
        }
      }
    } else if (command.commandName === DISCORD_PLUGIN_COMMAND) {

      switch (command.options.getSubcommand()) {
        case 'signup': return await handleSignupCommand(command)

        case 'listen-for': return await handleListenCommand(client, command);
        case 'logs': return await handleLogsCommand(client, command);

        default: break;
      }
    }

    logger.warn({
      command: command.commandName,
      subcommand: command.options.getSubcommand()
    }, `could not find command (expected one of ${DISCORD_MANAGE_COMMAND} or ${DISCORD_PLUGIN_COMMAND})`)
    return await command.reply({ content: `I'm sorry, HAL. I don't know what you mean.`, ephemeral: true })
  })

  // try to re-login every 2 minutes after start.
  let timeout = 2 * 60 * 1000;
  await login();
  async function login() {
    try {
      await client.login(DISCORD_BOT_TOKEN);
      timeout = 2 * 60 * 1000;
      setTimeout(login, timeout)
    } catch (err) {
      setTimeout(login, Math.max(timeout * 2, 5 * 60 * 1000))
    }
  }
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }

  if (!safe(pattern)) {
    return false;
  }

  return true;
}


async function handleSignupCommand(command: CommandInteraction) {
  const discordUser = command.user;

  const [created, dbUser] = await registerUser({
    username: discordUser.tag,
    discord: {
      id: discordUser.id,
      discriminator: discordUser.discriminator,
      username: discordUser.username,
      avatar: discordUser.avatar,
      hexAccentColor: discordUser.accentColor || undefined,
    }
  });

  const xtp = getXtpData(dbUser);

  if (!created) {
    return await command.reply({
      content: `It looks like you've already registered! Run \`/${DISCORD_PLUGIN_COMMAND} listen-for\` to create a plugin.

Visit ${xtp.inviteLink} if you haven't already; if you have any trouble ping one of the admins.
    `,
      ephemeral: true,
    });
  }

  await command.reply({
    content: `To get started, please register as a guest developer by clicking the link below.
  
  ${xtp.inviteLink}
  Once your account is active, you can dive right in and start building your first plugin.
  
  XTP Product docs can be found here: https://docs.xtp.dylibso.com/
  
  Run \`/${DISCORD_PLUGIN_COMMAND} listen-for\` to register a plugin.`,
    ephemeral: true,
  });
}

async function refreshCommands(rest: REST, logger: Logger) {
  if (!DISCORD_BOT_CLIENT_ID) {
    return;
  }

  const management = new SlashCommandBuilder()
    .setName(DISCORD_MANAGE_COMMAND)
    .setDescription('Control plugins')
    .addSubcommand(subcommand => subcommand
      .setName('invite')
      .setDescription('add plugin to channel (admin only)')
      .addStringOption(option => option
        .setName('plugin')
        .setDescription('The plugin to add')
        .setRequired(true)
      )
      .addChannelOption(option => option
        .setName('channel')
        .setDescription('The channel to add the plugin to (defaults to current channel)')
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName('kick')
      .setDescription('kick plugin from channel (admin only)')
      .addStringOption(option => option
        .setName('plugin')
        .setDescription('The plugin to kick')
        .setRequired(true)
      )
      .addChannelOption(option => option
        .setName('channel')
        .setDescription('The channel to kick the plugin from (defaults to current channel)')
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName('list')
      .setDescription('list active plugins')
    )
    .addSubcommand(subcommand => subcommand
      .setName('set-allowed-hosts')
      .setDescription('allow a plugin to access a host (admin-only)')
      .addStringOption(option => option
        .setName('plugin')
        .setDescription('The name of the plugin')
        .setRequired(true)
      )
      .addStringOption(option => option
        .setName('hosts')
        .setDescription('The host the plugin is allowed to access (wildcard, comma-separated; leave blank to block all hosts)')
      )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

  const plugins = new SlashCommandBuilder()
    .setName(DISCORD_PLUGIN_COMMAND)
    .setDescription('make discord squishy: write bots')
    .addSubcommand(subcommand => subcommand
      .setName('signup')
      .setDescription('sign up to write plugins')
    )
    .addSubcommand(subcommand => subcommand
      .setName('logs')
      .addStringOption(option => option
        .setName('plugin')
        .setDescription('The name of the plugin')
        .setRequired(true)
      )
      .setDescription('Get the most recent logs for a plugin')
    )
    .addSubcommand(subcommand => subcommand
      .setName('listen-for')
      .setDescription('Tell a plugin to listen for certain message content')
      .addStringOption(option => option
        .setName('regex')
        .setDescription('the regex to match (e.g. "[a-zA-Z0-9]+", POSIX regular expression)')
        .setRequired(true)
      )
      .addStringOption(option => option
        .setName('plugin')
        .setDescription('the name of the plugin to run')
      )
    )

  try {
    logger.info('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(DISCORD_BOT_CLIENT_ID),
      { body: [management, plugins] },
    );

    logger.info('Successfully reloaded application (/) commands.');
  } catch (error) {
    logger.error(error);
  }
}

async function handleLogsCommand(_client: Client, command: ChatInputCommandInteraction) {
  const plugin = command.options.get('plugin')?.value as string
  let [username, pluginName] = plugin!.split(':')
  if (!pluginName) {
    pluginName = username
    username = command.user.username
  }

  if (!pluginName) {
    return await command.reply({ content: `Could not parse bot name.`, ephemeral: true })
  }

  const isAdmin = (
    command.memberPermissions &&
    command.memberPermissions.has([PermissionsBitField.Flags.Administrator])
  )

  if (command.user.username !== username && !isAdmin) {
    return await command.reply({
      content: "You can only request logs for your own plugins",
      ephemeral: true,
    })
  }

  const invocation = await fetchLastInvocation(username, pluginName)
  if (!invocation) {
    return await command.reply({
      content: "Plugin hasn't been invoked.",
      ephemeral: true,
    })
  }

  const file = new AttachmentBuilder(Buffer.from(JSON.stringify(invocation.logs), 'utf8'), {
    name: 'logs.json',
    description: 'json logs'
  })

  return await command.reply({
    content: `
${pluginName} was last executed at ${invocation.created_at}.

It ran for ${invocation.duration} millisecond${invocation.duration === 1 ? '' : 's'} and used ${invocation.cost} token${invocation.cost === 1 ? '' : 's'}.

It produced the following result: ${'```'}
${invocation.result}
${'```'}
    `.trim(),
    ephemeral: true,
    files: [file]
  })
}

async function handleListenCommand(_client: Client, command: ChatInputCommandInteraction) {
  const regex = command.options.get('regex')?.value as string;
  const plugin = command.options.get('plugin')?.value as string || pokemon.random().toLowerCase();
  const guild = command.guildId;

  if (!guild) {
    // how is this possible?
    return await command.reply({
      content: "This command must be run in a guild",
      ephemeral: true,
    })
  }

  if (!regex || !plugin) {
    return await command.reply({
      ephemeral: true,
      content: "You need to provide a regex and a plugin name"
    });
  }

  if (!isValidRegex(regex)) {
    return await command.reply({
      ephemeral: true,
      content: "Please provide a valid regex pattern. Hint: use https://regex101.com/ to test your regex."
    });
  }

  const member = await command.guild?.members.fetch(command.user.id)
  if (!member) {
    return await command.reply({
      ephemeral: true,
      content: "Could not find a member for this user"
    });
  }
  const dbUser = await findUserByUsername(command.user.tag);
  if (!dbUser) {
    return await command.reply({
      content: "You need to register your account first. Use the /register command",
      ephemeral: true,
    });
  }

  const registered = await registerMessageContentInterest({
    pluginName: plugin,
    regex: regex,
    userId: dbUser.id,
    guild,
    isAdmin: member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  });

  if (!registered) {
    return await command.reply({
      content: `It looks like you've already registered that bot!`,
      ephemeral: true,
    });
  }

  await command.reply({
    content: `Subscribed for messages matching \`${regex}\` with plugin \`${plugin}\` in the "bots" channel.

Grab the \`xtp\` CLI from the install instructions here: <https://xtp-docs.pages.dev/docs/guest-usage/getting-started>

Run \`xtp plugin init --path ${plugin}\`, then \`xtp plugin build\` and \`xtp plugin push\` to install and run your bot!`,
    ephemeral: true,
  });
}
