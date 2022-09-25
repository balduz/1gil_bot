const Emojis = {
  TANK: '<:tank:867880962864185345>',
  HEALER: '<:healer:867880962955018240>',
  DPS: '<:dps:867880962929852416>'
};

const Tank = {
  name: 'tank',
  emoji: Emojis.TANK,
  embedName: 'Tanques',
};

const Healer = {
  name: 'healer',
  emoji: Emojis.HEALER,
  embedName: 'Healers',
};

const DPS = {
  name: 'dps',
  emoji: Emojis.DPS,
  embedName: 'DPS',
};


const Roles = {
  Tank: Tank,
  Healer: Healer,
  Dps: DPS
};

module.exports = { Emojis, Roles };