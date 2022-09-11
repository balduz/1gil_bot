const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const wait = require('node:timers/promises').setTimeout;

const DEFAULT_PARTY_SIZE = 8;

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = {
  data: new SlashCommandBuilder().setName('button').setDescription('Try out a button')
    .addStringOption(option => option.setName('titulo').setRequired(true).setDescription('Título del evento'))
    .addStringOption(option => option.setName('descripcion').setRequired(true).setDescription('Descripción del evento'))
    .addIntegerOption(option => option.setName('dia').setRequired(true).setMinValue(1).setMaxValue(31).setDescription('Día, entre 1 y 31'))
    .addIntegerOption(option => option.setName('mes').setRequired(true).setMinValue(1).setMaxValue(12).setDescription('Mes, entre 1 y 12'))
    .addIntegerOption(option => option.setName('hora').setRequired(true).setMinValue(0).setMaxValue(23).setDescription('Hora, entre 0 y 23'))
    .addIntegerOption(option => option.setName('minutos').setRequired(true).setMinValue(0).setMaxValue(59).setDescription('Minutos, entre 0 y 59'))
    .addIntegerOption(option => option.setName('tamaño').setMinValue(1).setDescription('Hasta cuánta gente puede apuntarse')),
  async execute(interaction) {
    const { options } = interaction;
    const title = options.getString('titulo');
    const desc = options.getString('descripcion');
    const day = options.getInteger('dia');
    const month = options.getInteger('mes');
    const hour = options.getInteger('hora');
    const mins = options.getInteger('minutos');
    const size = options.getInteger('tamaño') || DEFAULT_PARTY_SIZE;

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
      console.log(msg.user.id);
      return !ids.has(msg.user.id);
    }

    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      max: size,
      time: 1000 * 5
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
        console.log('si')
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
      const res = await fetch('http://localhost:8080/api/event', {
        method: 'post',
        body: JSON.stringify(newEvent),
        headers: { "Content-Type": "application/json" }
      })
    });

    await interaction.reply({ components: [row], embeds: [embed] });
  }
}
