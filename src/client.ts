
import { Client, GatewayIntentBits } from 'discord.js';
import { DISCORD_BOT_TOKEN} from './config';

export function startDiscordClient() {
  if (!DISCORD_BOT_TOKEN) {
    return;
  }
  
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

  client.login(DISCORD_BOT_TOKEN);
}
