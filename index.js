require('dotenv').config();
require('console-stamp')(console);

const fs = require('node:fs')
const path = require('node:path')

const { Client, GatewayIntentBits, Collection } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

handleCommands = (client) => {
  client.commands = new Collection()
  const commandsPath = path.join(__dirname, 'commands')
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file)
    const command = require(filePath)
    client.commands.set(command.data.name, command)
  }
}

handleCommands(client)

client.on('ready', () => {
  console.log('The bot is ready')
})

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return

    try {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand !== '') {
        await command.subcommands[subcommand](interaction);
      } else {
        await command.execute(interaction);
      }
    } catch (error) {
      console.error(error)
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true })
    }
  }
})

client.login(process.env.BOT_TOKEN)
