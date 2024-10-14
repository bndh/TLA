const { ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

const updateReportThreadTags = require("./helperModules/updateReportThreadTags");
const updateReportThreadButtons = require("./helperModules/updateReportThreadButtons");

module.exports = {
	data: new ButtonBuilder()
		.setCustomId("open")
		.setDisabled(true) // Disabled because all posts open by default
		.setLabel("Open")
		.setEmoji("♻️")
		.setStyle(ButtonStyle.Success),
	async execute(interaction) {
		await interaction.deferUpdate();
		const thread = interaction.channel;
		
		await Promise.all([
			updateReportThreadTags(thread, "open"),
			updateReportThreadButtons(thread, false)
		]);

		await interaction.followUp({
			embeds: [EmbedBuilder.generateSuccessEmbed("Successfully **opened** this report!")],
			ephemeral: true
		});
	}
};