const path = require("path");
const { ActionRowBuilder, Collection, EmbedBuilder, StringSelectMenuBuilder, SlashCommandBuilder } = require("discord.js");
const getAllExports = require("../../utility/files/getAllExports");
const getAllFiles = require("../../utility/files/getAllFiles");
const TextFormatter = require("../../utility/TextFormatter");

const helpCategories = getAllExports(path.join(__dirname, "helpModules"), file => !file.isDirectory());	
const helpEmbed = generateHelpEmbed(helpCategories);

module.exports = {
	data: new SlashCommandBuilder()
		.setName("help")
		.setDescription("Gives helpful information about all aspects of TLA."),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});
		
		const helpMenu = generateHelpMenu(helpCategories);

		const replyResponse = await interaction.editReply({
			embeds: [helpEmbed],
			components: [new ActionRowBuilder().setComponents(helpMenu)]
		});
	
		let menuResponse;
		try {
			menuResponse = await replyResponse.awaitMessageComponent({time: parseInt(process.env.HELP_MAX_TIME)}); // No need for filter users as the response is ephemeral
		} catch(error) {
			interaction.editReply({
				embeds: [
					EmbedBuilder.generateFailEmbed("You took **too long**...\nYou may try again by re-using the **/help** command.")
						.setFooter({text: "Time Limit: 0s", iconURL: "https://em-content.zobj.net/source/twitter/408/timer-clock_23f2-fe0f.png"})
				],
				components: [new ActionRowBuilder().setComponents(helpMenu.setDisabled(true))]
			});
			return;
		}
		
		await menuResponse.deferUpdate();
		for(const helpCategory of helpCategories) {
			if(menuResponse.values.includes(helpCategory.value)) {
				interaction.editReply({
					embeds: [generateCategoryEmbed(helpCategory)], // Dynamically generated for memory
					components: [new ActionRowBuilder().setComponents(helpMenu.setDisabled(true))]
				});
				return;
			}
		} // No category found
		menuResponse.editReply({
			embeds: [EmbedBuilder.generateFailEmbed("**Bad request!** That option **does not exist**...\nYou may try again by re-using the **/help** command.")],
			components: [new ActionRowBuilder().setComponents(helpMenu.setDisabled(true))]
		})
	} 
};

function generateHelpEmbed(helpCategories) {
	let description = `The **Audit Report** help menu currently has **${helpCategories.length}** categories.\nPlease **select** the field which **best matches your query:**`;
	
	const fields = helpCategories.map(category => ({
		name: `${category.emoji} ${category.label}`,
		value: category.description, 
		inline: true
	}));
	return EmbedBuilder.generateNeutralEmbed(description, {name: "TLA Bot Help"})
		.setFields(...fields)
		.setFooter({text: "Time Limit: 90s", iconURL: "https://em-content.zobj.net/source/twitter/408/timer-clock_23f2-fe0f.png"})
}

function generateHelpMenu(helpCategories) {
	return new StringSelectMenuBuilder()
		.setCustomId("help-menu")
		.setPlaceholder("Select the field for which you need help...")
		.setOptions(...helpCategories);
}

function generateCategoryEmbed(helpCategory) {
	const termFolderPath = path.join(__dirname, "helpModules", `${helpCategory.value}Terms`);
	const terms = getAllFiles(termFolderPath) // Assumes folder depth of 1
		.sort((fileA, fileB) => parseInt(fileA.name.match(/\d+/)) - parseInt(fileB.name.match(/\d+/))) // Sort according to number (asc.)
		.map(file => require(path.join(termFolderPath, file.name)));

	let description = `The **FAQ Section** currently has **${terms.length}** terms:`;
	for(const term of terms) {
		const titleText = `${term.emoji} __**${term.name}**__`;
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

	return new EmbedBuilder() // TODO custom colours!!
		.setDescription(description)
		.setAuthor({name: `TLA Bot ${helpCategory.label} Section`, iconURL: helpCategory.emojiURL})
		.setColor(helpCategory.color);
}