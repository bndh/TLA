const {SlashCommandBuilder} = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("ping")
		.setDescription("Replies with plang!"),
	async execute(interaction) {
		await interaction.reply("Plang!");
	}
};