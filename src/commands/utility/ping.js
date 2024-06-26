const {SlashCommandBuilder} = require("discord.js");
require("dotenv").config();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("ping")
		.setDescription("Replies with plang!"),
	async execute(interaction) {
		await interaction.reply(process.env.VETO_FORUM_ID);
	}
};