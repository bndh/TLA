const {SlashCommandBuilder} = require("discord.js");
const Submission = require("../../database/submission");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("add-db")
		.setDescription("Adds data to the database")
		.addStringOption(option => 
			option.setName("data")
				.setDescription("The data to be added")
				.setRequired(true)
		),
	async execute(interaction) {
		const submission = new Submission({
			userId: interaction.user.id,
			content: interaction.options.getString("data", true)
		});
		submission.save().then((v) => {
			interaction.reply({content: "Data saved!", ephemeral: true});
		});
	}
};