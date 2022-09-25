const { Roles } = require("../constants")

const roleFromName = (name) => {
  switch (name) {
    case 'tank': return Roles.Tank;
    case 'healer': return Roles.Healer;
    case 'dps': return Roles.Dps;
  }
}

module.exports = { roleFromName };