const { ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

const { Info } = require("../../mongo/mongoModels").modelData;

const updateReportThreadTags = require("./helperModules/updateReportThreadTags");
const updateReportThreadButtons = require("./helperModules/updateReportThreadButtons");

module.exports = {
	data: new ButtonBuilder()
		.setCustomId("close")
		.setLabel("Close")
		.setEmoji("⛔")
		.setStyle(ButtonStyle.Danger),
	async execute(interaction) {
		await interaction.deferUpdate();
		const thread = interaction.channel;
	
		await Promise.all([
			updateReportThreadTags(thread, "closed"),
			updateReportThreadButtons(thread, true),
			thread.unpin(),
			Info.enqueue(() => Info.findOneAndDelete({id: "pinnedReportId", data: thread.id}).exec())
		]);

		await interaction.followUp({
			embeds: [EmbedBuilder.generateSuccessEmbed("Successfully **closed** this report!")],
			ephemeral: true
		});
	}
};