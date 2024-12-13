const { SlashCommandBuilder } = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("ping")
		.setDescription("Replies with 'Pong!'. Useful to check if the bot is frozen/spinning.")
		.addBooleanOption(optionBuilder =>
			optionBuilder.setName("ephemeral")
			.setDescription("Whether or not the response will be visible to other users.")
			.setRequired(false)
		),
	execute(interaction) {
		let ephemeral = interaction.options.getBoolean("ephemeral", false) ?? true;
		interaction.reply({content: "Pong!", ephemeral: ephemeral});
	}
}