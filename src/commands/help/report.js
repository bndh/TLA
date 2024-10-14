const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder } = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("report")
		.setDescription("Report an issue to the admin team.")
		.addSubcommand(subcommandBuilder => subcommandBuilder
			.setName("issue")
			.setDescription("Report an issue to the admin team.")
		)
		.addSubcommand(subcommandBuilder => subcommandBuilder
			.setName("suggestion")
			.setDescription("Make a suggestion to the admin team.")
		),
	async execute(interaction) {
		const subcommandId = interaction.options.getSubcommand();

		const subjectField = new TextInputBuilder()
			.setCustomId("subject")
			.setLabel("What is the subject of your report?")
			.setPlaceholder("Please enter an appropriate topic...")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);
		const descriptionField = new TextInputBuilder()
			.setCustomId("description")
			.setLabel(`Please describe your ${subcommandId === "issue" ? "issue" : "suggestion"}:`)
			.setPlaceholder("Please be detailed in your description...")
			.setStyle(TextInputStyle.Paragraph)
			.setMaxLength(2000)
			.setRequired(true);

		const modal = new ModalBuilder()
			.setCustomId(`report-${interaction.options.getSubcommand()}`)
			.setTitle("TLA Report Menu")
			.setComponents(
				new ActionRowBuilder().setComponents(subjectField),
				new ActionRowBuilder().setComponents(descriptionField)
			);

		await interaction.showModal(modal);
	}
}