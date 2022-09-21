require('dotenv').config();

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

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
const EVENTS_SIZE_OPTION = 'cuántos';

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

    const embeds = eventsData.map((eventData) => new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(eventData.name)
      .setDescription(eventData.description)
      .addFields(
        { name: 'Fecha', value: capitalizeFirstLetter(new Date(eventData.date).toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })) },
        { name: 'Hora', value: new Date(eventData.date).toLocaleTimeString('es-ES', { hour: 'numeric', minute: 'numeric' }) },
        { name: `Participantes`, value: eventData.participants.join('\n') }
      ));

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
  const size = options.getInteger(SIZE_OPTION) || DEFAULT_PARTY_SIZE;

  const author = interaction.guild.members.cache.get(interaction.user.id).displayName;
  const authorAvatar = interaction.user.avatarURL();
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

  const embed = buildNewEventEmbed(title, desc, date, author, size, authorAvatar);

  await interaction.reply({ components: [row], embeds: [embed] });
  const client = interaction.client;
  const channelId = interaction.channelId;
  const msg = await interaction.fetchReply();
  const msgId = msg.id;

  const ids = new Set();
  const participants = [];
  const filter = (msg) => {
    return !ids.has(msg.user.id);
  }

  const collector = msg.createMessageComponentCollector({
    filter,
    max: size,
    time: 1000 * 3600 * 24
  });

  let updatePromise = Promise.resolve();
  collector.on('collect', i => {
    if (i.customId === 'no') {
      collector.stop();
      return;
    }

    const defer = i.deferUpdate();

    const userName = i.guild.members.cache.get(i.user.id).displayName;
    participants.push(userName);
    ids.add(i.user.id);

    i.message.embeds[0].fields.map(field => {
      if (!field.name.startsWith('Participantes')) {
        return field;
      }
      field.value = field.value === '-' ? userName : field.value + "\n" + userName;
      field.name = `Participantes (${ids.size}/${size})`;
    })

    updatePromise = Promise.all(defer, updatePromise).then(() => i.update({ embeds: i.message.embeds }));
  });

  collector.on('end', async collected => {
    const channel = await client.channels.fetch(channelId);
    updatePromise.then(() => channel.messages.delete(msgId));

    if (participants.length < size) {
      await channel.send({ embeds: [buildNewEventEmbed(`Cancelado: ~~${title}~~`, desc, date, author, size, authorAvatar, participants)] });
      return;
    }

    await channel.send({ embeds: [buildNewEventEmbed(title, desc, date, author, size, authorAvatar, participants)] });

    const newEvent = {
      name: title,
      description: desc,
      date: date,
      participants: collected.map(i => i.guild.members.cache.get(i.user.id).displayName)
    };

    try {
      const res = await fetch(process.env.BACKEND_URL + '/api/event', {
        method: 'post',
        body: JSON.stringify(newEvent),
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        console.log(`Event ${title} with size ${participants.length} saved`);
      } else {
        console.warn(`Event ${title} failed to save: ${res.text()}`);
      }
    } catch (error) {
      console.error(error);
    }

  });
}

const buildNewEventEmbed = (title, desc, date, author, size, avatar, participants = []) => {
  return new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(title)
    .setDescription(desc)
    .addFields(
      { name: 'Fecha', value: capitalizeFirstLetter(date.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })) },
      { name: 'Hora', value: date.toLocaleTimeString('es-ES', { hour: 'numeric', minute: 'numeric' }) },
      { name: `Participantes (${participants.length}/${size})`, value: `${participants.length > 0 ? participants.join('\n') : '-'}` }
    )
    .setFooter({ text: `Creado por ${author}`, iconURL: avatar })
    .setTimestamp();
}
