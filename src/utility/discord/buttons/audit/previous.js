const { PermissionFlagsBits } = require("discord.js");
const turnPage = require("./helperModules/turnPage")

module.exports = {
	customId: "previous",
	permissionBits: PermissionFlagsBits.Administrator,
	execute(interaction) { // TODO change awaits to be here, isolate turnpage function
		return turnPage(interaction, false);
	}
}