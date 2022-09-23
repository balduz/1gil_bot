const { EmbedBuilder } = require('discord.js');

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const roles = {
  tank: 1,
  healer: 2,
  dps: 3
};

class Composition {
  constructor(tanks, healers, dps) {
    this.tanks = tanks;
    this.healers = healers;
    this.dps = dps;
    this.size = tanks + healers + dps;
  }
}

parseComposition = (comp) => {
  const components = comp.split('-').map((x) => parseInt(x));
  if (components.length !== 3) {
    throw new Error(`invalid party composition: ${comp}`);
  }
  return new Composition(components[0], components[1], components[2]);
}

class PartyEmbed {
  constructor(comp, tanks = [], healers = [], dps = []) {
    this.comp = comp;
    this.tanks = tanks;
    this.healers = healers;
    this.dps = dps;
  }

  isFull() {
    return this.comp.size == this.getSize();
  }

  getSize() {
    return this.tanks.length + this.healers.length + this.dps.length;
  }

  add(role, user) {
    switch (role) {
      case roles.tank:
        this.addTank(user);
        break;
      case roles.healer:
        this.addHealer(user);
        break;
      case roles.dps:
        this.addDPS(user);
        break;
    }
  }

  remove(role, user) {
    switch (role) {
      case roles.tank:
        this.removeTank(user);
        break;
      case roles.healer:
        this.removeHealer(user);
        break;
      case roles.dps:
        this.removeDPS(user);
        break;
    }
  }

  addTank(user) {
    this.tanks.push(user);
  }

  addHealer(user) {
    this.healers.push(user);
  }

  addDPS(user) {
    this.dps.push(user);
  }

  removeTank(user) {
    this.tanks = this.tanks.filter((tank) => tank !== user);
  }

  removeHealer(user) {
    this.healers = this.healers.filter((healer) => healer !== user);
  }

  removeDPS(user) {
    this.dps = this.dps.filter((dps) => dps !== user);
  }

  buildNewEmbed(title, desc, date, author = undefined, avatar = undefined) {
    let embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(title)
      .setDescription(desc)
      .addFields(
        { name: 'Fecha', value: capitalizeFirstLetter(date.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })) },
        { name: 'Hora', value: date.toLocaleTimeString('es-ES', { hour: 'numeric', minute: 'numeric' }) })
      .setTimestamp();

    if (author && avatar) {
      embed = embed.setFooter({ text: `Creado por ${author}`, iconURL: avatar });
    }
    if (this.comp.tanks > 0) {
      embed = embed.addFields({ name: listFieldName('<:tank:867880962864185345> Tanques', this.tanks, this.comp.tanks), value: listFieldValue(this.tanks), inline: true });
    }
    if (this.comp.healers > 0) {
      embed = embed.addFields({ name: listFieldName('<:healer:867880962955018240> Healers', this.healers, this.comp.healers), value: listFieldValue(this.healers), inline: true });
    }
    if (this.comp.dps > 0) {
      embed = embed.addFields({ name: listFieldName('<:dps:867880962929852416> DPS', this.dps, this.comp.dps), value: listFieldValue(this.dps), inline: true });
    }

    return embed;
  }

  updateEmbed(embed) {
    const updated = EmbedBuilder.from(embed);
    this.updateField(updated, 'Tanques', this.tanks, this.comp.tanks);
    this.updateField(updated, 'Healers', this.healers, this.comp.healers);
    this.updateField(updated, 'DPS', this.dps, this.comp.dps);
    return updated;
  }

  updateField(embed, name, list, size) {
    return embed.setFields(
      embed.data.fields.map(field => {
        if (!field.name.startsWith(name)) {
          return field;
        }
        field.value = listFieldValue(list);
        field.name = `${name} (${list.length}/${size})`;
        return field;
      })
    );
  }
};

listFieldName = (name, list, size) => {
  return `${name} (${list.length}/${size})`;
}

listFieldValue = (list) => {
  return list.length > 0 ? list.join('\n') : '-';
}

module.exports = { Composition, PartyEmbed, parseComposition, roles };
