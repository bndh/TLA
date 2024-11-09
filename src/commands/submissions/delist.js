const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { Judge } = require("../../mongo/mongoModels").modelData;

module.exports = {
	data: new SlashCommandBuilder()
		.setName("delist")
		.setDescription("Manually remove a user from their position.")
		.addUserOption(optionBuilder => 
			optionBuilder.setName("delistee")
				.setDescription("The user to be delisted. (Also may use user ID).")
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});

		const delistee = interaction.options.getUser("delistee", true);

		await Judge.enqueue(() => Judge.deleteOne({userId: delistee.id}).exec());
		await interaction.editReply({embeds: [EmbedBuilder.generateSuccessEmbed(`Successfully delisted ${delistee.toString()}!`)]});
	}
}; 