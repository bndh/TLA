const { EmbedBuilder } = require("discord.js");

module.exports = () => {
	EmbedBuilder.generateResponseEmbed = (author, description, color) => {
		return new EmbedBuilder()
			.setAuthor(author)
			.setDescription(description)
			.setColor(color);
	};

	EmbedBuilder.generateSuccessEmbed = (
		description = "Interaction **successful**!", 
		author = {name: "TLA Admin Team", url: "https://www.youtube.com/@bndh4409", iconURL: process.env.NORMAL_URL}
	) => {
		if(!author.iconURL) author.iconURL = process.env.NORMAL_URL;
		return EmbedBuilder.generateResponseEmbed(author, description, process.env.SUCCESS_COLOR);
	};

	EmbedBuilder.generateNeutralEmbed = (
		description = "Interaction **successful**!", 
		author = {name: "TLA Admin Team", url: "https://www.youtube.com/@bndh4409", iconURL: process.env.HARD_URL}
	) => {
		if(!author.iconURL) author.iconURL = process.env.HARD_URL;
		return EmbedBuilder.generateResponseEmbed(author, description, process.env.NEUTRAL_COLOR);
	};

	EmbedBuilder.generateFailEmbed = (
		description = "Something went **wrong**! Please **try again**.\nIf the issue **persists**, please contact _**@gamingpharoah**_.",
		author = {name: "TLA Admin Team", url: "https://www.youtube.com/@bndh4409", iconURL: process.env.EXTREME_DEMON_URL}
	) => {
		if(!author.iconURL) author.iconURL = process.env.EXTREME_DEMON_URL;
		return EmbedBuilder.generateResponseEmbed(author, description, process.env.FAIL_COLOR);
	};
}