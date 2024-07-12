import { ChannelType, Client, CommandInteraction, GatewayIntentBits, REST, Routes } from 'discord.js';
import safe from 'safe-regex';

import { DISCORD_BOT_TOKEN, DISCORD_BOT_CLIENT_ID, DISCORD_GUILD_FILTER, DISCORD_CHANNEL_FILTER } from './config';
import { findUserByUsername, getXtpData, registerUser } from './domain/users';
import { executeHandlers, fetchByContentInterest } from './domain/interests';
import { registerMessageHandler } from './domain/message-handlers';

export async function startDiscordClient() {
  if (!DISCORD_BOT_TOKEN) {
    return;
  }

  const rest = new REST({ version: '9' }).setToken(DISCORD_BOT_TOKEN);
  await refreshCommands(rest);

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
    console.log(`Logged in as ${client.user!.tag}!`);
  });

  client.on('messageCreate', async message => {
    if (message.author.id === client.user!.id) {
      return;
    }

    const guild = message.guild || { name: "", id: "" };

    if (message.channel.type !== ChannelType.GuildText) {
      console.log(`skipping message; channel type was not GuildText`)
      return
    }

    if (DISCORD_GUILD_FILTER.size && !DISCORD_GUILD_FILTER.has(guild.name)) {
      console.log(`skipping message; not in guild filter (got="${guild.name}"; valid="${[...DISCORD_GUILD_FILTER].join('", "')}")`)
      return
    }

    if (DISCORD_CHANNEL_FILTER.size && !DISCORD_CHANNEL_FILTER.has(message.channel.name)) {
      console.log(`skipping message; not in channel filter (guild="${guild.name}"; channel="${message.channel.name}")`)
      return
    }

    console.log(`Incoming message in "${guild.name}" "#${message.channel.name}" (${guild.id}): `, message.content);
    const handlers = await fetchByContentInterest({ guild: guild.id, channel: message.channel.name, content: message.content });
    await executeHandlers(client, handlers, {
      channel: message.channel.name,
      guild: guild.name,
      message: {
        id: message.id,
        content: message.content,
        author: message.author
      }
    }, {})
  });

  /*
  client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.message.channel.type !== ChannelType.GuildText) {
      console.log(`skipping message; channel type was not GuildText`)
      return
    }

    if (!reaction.message.guild) {
      return
    }
    const xtp = await getXtp();
    const handlers = await findMatchingReactionHandlers(reaction.message.guild!.name, reaction.message.channel!.name, reaction.message.id);

    const hrtime = process.hrtime();
    const promises = [];
    for (const handler of handlers) {
      promises.push(xtp.extensionPoints.events.handle(handler.user_id, {
        channel: reaction.message.channel.name,
        guild: reaction.message.guild.name,
        reaction: {
          from: user.username,
          with: reaction.emoji.name || reaction.emoji.id,
        },
      }, {
        bindingName: handler.plugin_name,
        default: {}
      }).then(
        _ => [, process.hrtime(hrtime)],
        err => [err,]
      ));
    }

    let idx = 0;
    for (const result of await Promise.allSettled(promises)) {
      if (result.status === 'rejected') {
        console.error(handlers[idx].user_id, handlers[idx].plugin_name, result.reason)
      } else {
        console.log(handlers[idx].user_id, handlers[idx].plugin_name, result.value)
      }

      ++idx;
    }

    console.log(user)
  })*/

  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) {
      return;
    }

    const command = interaction as CommandInteraction;

    switch (command.commandName) {
      case 'ping':
        await command.reply('Pong!');
        break;
      case 'echo':
        const message = command.options.get('message')?.value as string;
        await command.reply(message);
        break;

      case 'register':
        await handleRegisterCommand(command);

        break;
      case 'subscribe':
        await handleSubscribeCommand(command);
        break;
    }
  })

  client.login(DISCORD_BOT_TOKEN);
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


async function handleRegisterCommand(command: CommandInteraction) {
  const discordUser = command.user;

  const dbUser = await registerUser({
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

  await command.reply({
    content: `To get started, please activate your new XTP Host by clicking the link below.
  
  ${xtp.inviteLink}
  Once your account is active, you can dive right in and start building your first plugin.
  
  XTP Product docs can be found here: https://docs.xtp.dylibso.com/
  
  TODO: Add more helpful information here.`,
    ephemeral: true,
  });
}

async function refreshCommands(rest: REST) {
  if (!DISCORD_BOT_CLIENT_ID) {
    return;
  }

  const commands = [
    {
      name: 'ping',
      description: 'Replies with Pong!',
    },
    {
      name: 'echo',
      description: 'Echoes your input',
      options: [
        {
          name: 'message',
          type: 3, // STRING type
          description: 'The message to echo',
          required: true,
        },
      ],
    },
    {
      name: 'register',
      description: 'Register your account with the bot'
    },
    {
      name: 'subscribe',
      description: 'Subscribes to messages',
      options: [
        {
          name: 'regex',
          type: 3, // STRING type
          description: 'The regex to match',
          required: true,
        },
        {
          name: 'plugin',
          type: 3, // STRING type
          description: 'The plugin to run',
          required: true,
        }
      ]
    }
  ];

  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(DISCORD_BOT_CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}
async function handleSubscribeCommand(command: CommandInteraction) {
  const regex = command.options.get('regex')?.value as string;
  const plugin = command.options.get('plugin')?.value as string;
  const guild = command.guildId;

  console.log(command.guild)
  console.log(command.channel)
  if (!guild) {
    // how is this possible?
    await command.reply({
      content: "This command must be run in a guild",
      ephemeral: true,
    })
    return;
  }

  if (!regex || !plugin) {
    await command.reply({
      content: "You need to provide a regex and a plugin name"
    });
  }

  if (!isValidRegex(regex)) {
    await command.reply({
      content: "Please provide a valid regex pattern. Hint: use https://regex101.com/ to test your regex."
    });
    return;
  }

  const dbUser = await findUserByUsername(command.user.tag);
  if (!dbUser) {
    await command.reply({
      content: "You need to register your account first. Use the /register command",
      ephemeral: true,
    });
    return;
  }

  await registerMessageHandler({
    plugin_name: plugin,
    regex: regex,
    user_id: dbUser.id,
    guild: guild,
  });

  await command.reply({
    content: `Subscribed to messages matching \`${regex}\` with plugin \`${plugin}\``,
    ephemeral: true,
  });
}

