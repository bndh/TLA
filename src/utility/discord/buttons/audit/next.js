const { PermissionFlagsBits } = require("discord.js");
const turnPage = require("./helperModules/turnPage")

module.exports = {
	customId: "next",
	permissionBits: PermissionFlagsBits.Administrator,
	execute(interaction) {
		return turnPage(interaction);
	}
}