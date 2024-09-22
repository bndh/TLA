const path = require("path");
const { EmbedBuilder } = require("discord.js");
const getAllExports = require("../../../utility/files/getAllExports");
const TextFormatter = require("../../../utility/TextFormatter");
const getAllFiles = require("../../../utility/files/getAllFiles");

module.exports = {
	value: "dictionary",
	label: "Dictionary",
	description: "Browse definitions of important TLA Audit terms.",
	emoji: "📘",
	generateEmbed
}

function generateEmbed() {
	const termFolderPath = path.join(__dirname, "dictionaryTerms");
	const terms = getAllFiles(termFolderPath) // Assumes folder depth of 1
		.sort((fileA, fileB) => parseInt(fileA.name.match(/\d+/)) - parseInt(fileB.name.match(/\d+/))) // Sort according to number (asc.)
		.map(file => require(path.join(termFolderPath, file.name)));

	let description = `The **Dictionary** currently has **${terms.length}** terms:`;
	for(const term of terms) {
		const titleText = `**__${term.emoji} ${term.name}__**`;
		const definitionText = TextFormatter.bulletText(term.definition);
		description += "\n\n" +
					   titleText + "\n" +
					   definitionText;

		if(term.example) {
			let exampleText = term.example.map(exampleText => `_${exampleText}_`);
			exampleText = TextFormatter.bulletText(exampleText, 1);
			description += `\n- _Example:_\n${exampleText}`;
		}
	}

	return new EmbedBuilder()
		.setDescription(description)
		.setAuthor({name: "TLA Bot Dictionary", iconURL: "https://em-content.zobj.net/source/twitter/408/blue-book_1f4d8.png"})
		.setColor(process.env.NEUTRAL_COLOR);
}