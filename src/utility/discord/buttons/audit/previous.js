const { PermissionsBitField } = require("discord.js");
const getTurnedPageData = require("./helperModules/getTurnedPageData");

module.exports = {
	customId: "previous",
	permissionBits: PermissionsBitField.Flags.Administrator,
	async execute(interaction) {
		await interaction.deferUpdate();
		const pageData = await getTurnedPageData(
			interaction.client, 
			interaction.message.embeds[0], 
			interaction.message.components[0],
			false
		);
		await interaction.editReply(pageData);
	}
}