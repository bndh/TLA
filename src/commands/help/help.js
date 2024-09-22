const path = require("path");
const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SlashCommandBuilder } = require("discord.js");
const getAllExports = require("../../utility/files/getAllExports");
// TODO generate some of this staticaclly 
module.exports = {
	data: new SlashCommandBuilder()
		.setName("help")
		.setDescription("Gives helpful information about all aspects of TLA."),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});

		const helpCategories = getAllExports(path.join(__dirname, "helpModules"), file => !file.isDirectory());
		
		const helpEmbed = generateHelpEmbed(helpCategories);
		const helpMenu = generateHelpMenu(helpCategories); // Help Menu used later
		const replyResponse = await interaction.editReply({
			embeds: [helpEmbed],
			components: [new ActionRowBuilder().setComponents(helpMenu)]
		});
	
		let menuResponse;
		try {
			menuResponse = await replyResponse.awaitMessageComponent({time: 90_000}); // No need for filter users as the response is ephemeral
		} catch(error) {
			interaction.editReply({
				embeds: [generateNoTimeEmbed()],
				components: [new ActionRowBuilder().setComponents(helpMenu.setDisabled(true))]
			});
			return;
		}
		
		// TODO respond if no help category found
		menuResponse.deferUpdate();
		for(const helpCategory of helpCategories) {
			if(menuResponse.values.includes(helpCategory.value)) {
				interaction.editReply({
					embeds: [helpCategory.generateEmbed()]
				});
				return;
			}
		}
	} 
};

function generateHelpEmbed(helpCategories) {
	let description = `The **Audit Report** help menu currently has **${helpCategories.length}** categories.\nPlease **select** the field which **best matches your query:**`;
	
	const fields = helpCategories.map(category => ({
		name: `${category.emoji} ${category.label}`,
		value: category.description, 
		inline: true
	}));
	return new EmbedBuilder()
		.setDescription(description)
		.setFields(...fields) // helpCategories have values set for name, value, and inline, which correspond with the properties for a field
		.setAuthor({name: "TLA Bot Help", iconURL: process.env.HARD_URL})
		.setFooter({text: "Time Limit: 90s", iconURL: "https://em-content.zobj.net/source/twitter/408/timer-clock_23f2-fe0f.png"})
		.setColor(process.env.NEUTRAL_COLOR)
}

function generateHelpMenu(helpCategories) {
	return new StringSelectMenuBuilder()
		.setCustomId("help-menu")
		.setPlaceholder("Select the field for which you need help...")
		.setOptions(...helpCategories);
}

function generateNoTimeEmbed() {
	return new EmbedBuilder()
			.setDescription("You took **too long**...\nYou may try again by re-using the **/help** command.")
			.setAuthor({name: "TLA Bot Help", iconURL: process.env.EXTREME_DEMON_URL})
			.setFooter({text: "Time Limit: 0s", iconURL: "https://em-content.zobj.net/source/twitter/408/timer-clock_23f2-fe0f.png"})
			.setColor(process.env.FAIL_COLOR);
}