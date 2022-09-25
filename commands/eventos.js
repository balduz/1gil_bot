require('dotenv').config();

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const { Emojis } = require('../constants');
const { roleFromName } = require('../model/role');
const { parseComposition, PartyEmbed } = require('../model/partyembed');

const TITLE_OPTION = 'titulo';
const DESC_OPTION = 'descripción';
const DAY_OPTION = 'día';
const MONTH_OPTION = 'mes';
const HOUR_OPTION = 'hora';
const MINS_OPTION = 'minutos';
const COMP_OPTION = 'composición';
const EVENTS_SIZE_OPTION = 'cuántos';

const DEFAULT_PARTY_COMP = '2-2-4';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eventos')
    .setDescription('Gestionar eventos en 1 Gil')
    .addSubcommand(subcommand =>
      subcommand.setName('nuevo')
        .setDescription('Crea un nuevo evento')
        .addStringOption(option => option.setName(TITLE_OPTION).setRequired(true).setDescription('Título del evento'))
        .addStringOption(option => option.setName(DESC_OPTION).setRequired(true).setDescription('Descripción del evento'))
        .addIntegerOption(option => option.setName(DAY_OPTION).setRequired(true).setMinValue(1).setMaxValue(31).setDescription('Día, entre 1 y 31'))
        .addIntegerOption(option => option.setName(MONTH_OPTION).setRequired(true).setMinValue(1).setMaxValue(12).setDescription('Mes, entre 1 y 12'))
        .addIntegerOption(option => option.setName(HOUR_OPTION).setRequired(true).setMinValue(0).setMaxValue(23).setDescription('Hora, entre 0 y 23'))
        .addIntegerOption(option => option.setName(MINS_OPTION).setRequired(true).setMinValue(0).setMaxValue(59).setDescription('Minutos, entre 0 y 59'))
        .addStringOption(option => option.setName(COMP_OPTION).setDescription('Composición de la party, en forma de Tanque-Healer-DPS. Por ejemplo 2-2-4'))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('siguientes')
        .setDescription('Muestra cuáles son los siguientes eventos')
        .addIntegerOption(option => option.setName(EVENTS_SIZE_OPTION).setMinValue(1).setDescription('Cuántos eventos mostrar, por defecto 1'))),
  subcommands: {
    'nuevo': async (interaction) => {
      await createNewEvent(interaction);
    },
    'siguientes': async (interaction) => {
      await getNextEvent(interaction);
    },
  }
}

const getNextEvent = async (interaction) => {
  await interaction.deferReply();

  const { options } = interaction;
  const size = options.getInteger(EVENTS_SIZE_OPTION) || 1;

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/events?size=${size}`);
    const eventsData = await res.json();

    console.log(`successfully fetched ${eventsData.length} events`);

    const embeds = eventsData.map((eventData) => {
      const party = new PartyEmbed(parseComposition('2-2-4'), eventData.tanks, eventData.healers, eventData.dps);
      return party.buildNewEmbed(eventData.name, eventData.description, new Date(eventData.date));
    });

    await interaction.editReply({ embeds });
  } catch (error) {
    console.error(error);
  }
}

const createNewEvent = async (interaction) => {
  const { options } = interaction;
  const title = options.getString(TITLE_OPTION);
  const desc = options.getString(DESC_OPTION);
  const day = options.getInteger(DAY_OPTION);
  const month = options.getInteger(MONTH_OPTION);
  const hour = options.getInteger(HOUR_OPTION);
  const mins = options.getInteger(MINS_OPTION);
  const comp = parseComposition(options.getString(COMP_OPTION) || DEFAULT_PARTY_COMP);

  const author = interaction.guild.members.cache.get(interaction.user.id).displayName;
  const avatar = interaction.user.avatarURL();
  const date = new Date(new Date().getFullYear(), month - 1, day, hour, mins);

  const party = new PartyEmbed(comp);

  const embed = party.buildNewEmbed(title, desc, date, author, avatar);

  const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
  await msg.react(Emojis.TANK)
    .then(() => msg.react(Emojis.HEALER))
    .then(() => msg.react(Emojis.DPS));

  const msgId = msg.id;
  const client = interaction.client;
  const channelId = interaction.channelId;
  const guild = interaction.guild;

  const ids = new Set();
  const filter = (reaction, user) => {
    //return reaction.emoji.name === 'tank' && !ids.has(user.id);
    return !ids.has(user.id) && msg.author.id != user.id;
    // return true
  }

  const collector = msg.createReactionCollector({
    filter,
    time: 1000 * 3600 * 24,
    dispose: true,
  });

  let updatePromise = Promise.resolve();
  collector.on('collect', (reaction, user) => {
    ids.add(user.id);

    const userName = guild.members.cache.get(user.id).displayName;
    party.add(roleFromName(reaction.emoji.name), userName);

    let embed = EmbedBuilder.from(reaction.message.embeds[0]);
    updatePromise = updatePromise.then(() => msg.edit({ embeds: [party.updateEmbed(embed)] }));

    if (party.isFull()) {
      collector.stop();
    }
  });

  collector.on('remove', (reaction, user) => {
    ids.delete(user.id);

    const userName = guild.members.cache.get(user.id).displayName;
    party.remove(roleFromName(reaction.emoji.name), userName);

    let embed = EmbedBuilder.from(reaction.message.embeds[0]);
    updatePromise = updatePromise.then(() => msg.edit({ embeds: [party.updateEmbed(embed)] }));
  })

  collector.on('end', async collected => {
    const channel = await client.channels.fetch(channelId);
    updatePromise.then(() => channel.messages.delete(msgId));

    if (!party.isFull()) {
      let embed = EmbedBuilder.from(reaction.message.embeds[0]);
      embed.setTitle(`Cancelado: ~~${title}~~`);
      await channel.send({ embeds: [party.updateEmbed(embed)] });
      return;
    }

    await channel.send({ embeds: [party.updateEmbed(embed)] });

    const newEvent = {
      name: title,
      description: desc,
      date: date,
      tanks: party.tanks,
      healers: party.healers,
      dps: party.dps,
    };

    try {
      const res = await fetch(process.env.BACKEND_URL + '/api/event', {
        method: 'post',
        body: JSON.stringify(newEvent),
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        console.log(`Event ${title} with size ${party.getSize()} saved`);
      } else {
        console.warn(`Event ${title} failed to save: ${res.text()}`);
      }
    } catch (error) {
      console.error(error);
    }
  });
}
