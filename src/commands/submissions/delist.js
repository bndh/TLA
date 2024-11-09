const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { Judge } = require("../../mongo/mongoModels").modelData;

module.exports = {
	data: new SlashCommandBuilder()
		.setName("delist")
		.setDescription("Manually remove a user from their judge position.")
		.addSubcommand(subCommandBuilder => subCommandBuilder
			.setName("by-tag")
			.setDescription("Delist a judge via their handle. (Recommended while they are in the server).")
			.addUserOption(optionBuilder => optionBuilder
				.setName("delistee")
				.setDescription("The user to be delisted.")
				.setRequired(true)
			)
		)
		.addSubcommand(subCommandBuilder => subCommandBuilder
			.setName("by-id")
			.setDescription("Delist a judge via their id. (Recommended if they are not in the server).")
			.addStringOption(optionBuilder => optionBuilder
				.setName("delistee-id")
				.setDescription("The user to be delisted's account id.")
				.setRequired(true)
			)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});

		let delistee, delisteeId;
		const subcommandId = interaction.options.getSubcommand()
		if(subcommandId === "by-tag") {
			delistee = interaction.options.getUser("delistee", true);
			delisteeId = delistee.id;
		} else if(subcommandId === "by-id") {
			delisteeId = interaction.options.getString("delistee-id", true);
		} else {
			await interaction.editReply({embeds: [EmbedBuilder.generateFailEmbed()]});
		}

		await Judge.enqueue(() => Judge.deleteOne({userId: delisteeId}).exec());
		await interaction.editReply({embeds: [
			EmbedBuilder.generateSuccessEmbed(`Successfully delisted ${delistee ? delistee.toString() : `<@${delisteeId}>`}!`)
		]});
	}
}; 