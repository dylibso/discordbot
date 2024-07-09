
import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

export function startDiscordClient(): Client {
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
    if (message.author.id === client.user!.id){
      return;
    }

    if (message.content === 'ping'){
      await message.reply('pong');
    } else {
      console.log(message.content);
    }
  });

  client.login(process.env.DISCORD_BOT_TOKEN);
  return client;
}
