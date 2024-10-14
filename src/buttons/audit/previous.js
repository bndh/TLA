const { PermissionsBitField, ButtonBuilder, ButtonStyle } = require("discord.js");
const getTurnedPageData = require("./helperModules/getTurnedPageData");

module.exports = {
	data: new ButtonBuilder()
		.setCustomId("previous")
		.setDisabled(true) // Always disabled on page 1
		.setEmoji("⬅️")
		.setStyle(ButtonStyle.Secondary),
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