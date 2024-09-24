const { PermissionFlagsBits } = require("discord.js");
const getTurnedPageData = require("./helperModules/getTurnedPageData");

module.exports = {
	customId: "previous",
	permissionBits: PermissionFlagsBits.Administrator,
	async execute(interaction) {
		await interaction.deferUpdate();
		const pageData = await getTurnedPageData(
			interaction.client, 
			interaction.message.embeds[0], 
			interaction.message.components[0],
			false
		);
		interaction.editReply(pageData);
	}
}