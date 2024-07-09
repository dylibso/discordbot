
import { Client, CommandInteraction, GatewayIntentBits, REST, Routes } from 'discord.js';
import { DISCORD_BOT_TOKEN, DISCORD_BOT_CLIENT_ID } from './config';
import { findMatchingMessageHandlers } from './domain/message-handlers';
import { getXtp } from './db';

export async function startDiscordClient() {
  if (!DISCORD_BOT_TOKEN) {
    return;
  }

  await refreshCommands(DISCORD_BOT_TOKEN);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.on('ready', () => {
    console.log(`Logged in as ${client.user!.tag}!`);
  });

  client.on('messageCreate', async message => {
    if (message.author.id === client.user!.id) {
      return;
    }

    const guild = message.guild || {name: "", id: ""};

    console.log(`Incoming message in ${guild.name} (${guild.id}): `, message.content);
    const xtp = await getXtp();
    const handlers = await findMatchingMessageHandlers(guild.id, message.content);

    for (let i = 0; i < handlers.length; i++){
      const handler = handlers[i];
      console.log("Found matching handler: ", handler.id, "regex=" + handler.regex);
      try {
        // TODO: provide more data (message user, channel name, ...) via plugin input
        const result = await xtp.extensionPoints['message_handlers'].handle_message(handler.user_id, message.content, {
          bindingName: handler.plugin_name,
          default: ""
        });

        if (result !== null && result!.length > 0){
          await message.reply(result!);
        }
      } catch (err) {
        console.error("Error running XTP extension", err);
      }
    }
  });

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
        await command.reply('Please register your account at https://www.youtube.com/watch?v=EE-xtCF3T94');
        break;
    }
  })

  client.login(DISCORD_BOT_TOKEN);
}

async function refreshCommands(token: string) {
  if (!DISCORD_BOT_CLIENT_ID) {
    return;
  }

  const rest = new REST({ version: '9' }).setToken(token);

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
