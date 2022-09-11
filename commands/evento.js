require('dotenv').config();

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = {
  data: new SlashCommandBuilder().setName('evento').setDescription('Crear un nuevo evento en 1 Gil'),
  async execute(interaction) {

    const res = await fetch(process.env.BACKEND_URL + '/api/event/next');
    console.log(res);
    const eventData = await res.json();
    console.log(eventData);

    const date = new Date(eventData.date);
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(eventData.name)
      .setDescription(eventData.description)
      .addFields(
        { name: 'Fecha', value: capitalizeFirstLetter(date.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })) },
        { name: 'Hora', value: date.toLocaleTimeString('es-ES', { hour: 'numeric', minute: 'numeric' }) },
        { name: `Participantes`, value: eventData.participants.join('\n') }
      )
      .setTimestamp();


    await interaction.reply({ embeds: [embed] });
  }
}
