require('dotenv').config();

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const wait = require('node:timers/promises').setTimeout;

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const TITLE_OPTION = 'titulo';
const DESC_OPTION = 'descripción';
const DAY_OPTION = 'día';
const MONTH_OPTION = 'mes';
const HOUR_OPTION = 'hora';
const MINS_OPTION = 'minutos';
const SIZE_OPTION = 'tamaño';

const DEFAULT_PARTY_SIZE = 8;

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
        .addIntegerOption(option => option.setName(SIZE_OPTION).setMinValue(1).setDescription('Hasta cuánta gente puede apuntarse'))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('siguiente')
        .setDescription('Muestra cuál es el siguiente evento')),
  subcommands: {
    'nuevo': async (interaction) => {
      await createNewEvent(interaction);
    },
    'siguiente': async (interaction) => {
      await getNextEvent(interaction);
    },
  }
}

const getNextEvent = async (interaction) => {
  await interaction.deferReply({ ephemeral: true });

  const res = await fetch(process.env.BACKEND_URL + '/api/event/next');
  const eventData = await res.json();

  const date = new Date(eventData.date);
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(eventData.name)
    .setDescription(eventData.description)
    .addFields(
      { name: 'Fecha', value: capitalizeFirstLetter(date.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Europe/Madrid' })) },
      { name: 'Hora', value: date.toLocaleTimeString('es-ES', { hour: 'numeric', minute: 'numeric', timeZone: 'Europe/Madrid' }) },
      { name: `Participantes`, value: eventData.participants.join('\n') }
    );


  await interaction.editReply({ embeds: [embed] });
}

const createNewEvent = async (interaction) => {
  const { options } = interaction;
  const title = options.getString(TITLE_OPTION);
  const desc = options.getString(DESC_OPTION);
  const day = options.getInteger(DAY_OPTION);
  const month = options.getInteger(MONTH_OPTION);
  const hour = options.getInteger(HOUR_OPTION);
  const mins = options.getInteger(MINS_OPTION);
  const size = options.getInteger(SIZE_OPTION) || DEFAULT_PARTY_SIZE;

  const author = interaction.guild.members.cache.get(interaction.user.id).displayName;
  const date = new Date(new Date().getFullYear(), month - 1, day, hour, mins);

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('yes')
        .setLabel('Yes')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('no')
        .setLabel('No')
        .setStyle(ButtonStyle.Danger));

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(title)
    .setDescription(desc)
    .addFields(
      { name: 'Fecha', value: capitalizeFirstLetter(date.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })) },
      { name: 'Hora', value: date.toLocaleTimeString('es-ES', { hour: 'numeric', minute: 'numeric' }) },
      { name: `Participantes (0/${size})`, value: '-' }
    )
    .setFooter({ text: `Creado por ${author}`, iconURL: interaction.user.avatarURL() })
    .setTimestamp();

  const ids = new Set();

  const filter = (msg) => {
    return !ids.has(msg.user.id);
  }

  const collector = interaction.channel.createMessageComponentCollector({
    filter,
    max: size,
    time: 1000 * 3600 * 24
  });

  let isUpdating = false;

  collector.on('collect', async i => {
    isUpdating = true;
    ids.add(i.user.id)
    i.message.embeds[0].fields.map(field => {
      if (!field.name.startsWith('Participantes')) {
        return field;
      }
      const userName = i.guild.members.cache.get(i.user.id).displayName;
      field.value = field.value === '-' ? userName : field.value + "\n" + userName;
      field.name = `Participantes (${ids.size}/${size})`;
    })
    await i.update({ embeds: i.message.embeds });
    isUpdating = false;
  });

  collector.on('end', async collected => {
    // Prevent reply updates if collect is still running.
    while (isUpdating) await wait(500);

    interaction.editReply({
      components: [],
    });
    if (collected.size < size) return;

    const newEvent = {
      name: title,
      description: desc,
      date: date,
      participants: collected.map(i => i.guild.members.cache.get(i.user.id).displayName)
    };
    const res = await fetch(process.env.BACKEND_URL + '/api/event', {
      method: 'post',
      body: JSON.stringify(newEvent),
      headers: { "Content-Type": "application/json" }
    })
  });

  await interaction.reply({ components: [row], embeds: [embed] });
}