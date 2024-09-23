const {Events, PermissionFlagsBits, EmbedBuilder} = require("discord.js");
const turnPage = require("../utility/discord/buttons/audit/turnPage");
const search = require("../utility/discord/buttons/audit/search");

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if(interaction.isChatInputCommand()) handleChatInputCommand(interaction);
		if(interaction.isButton()) handleButtonInteraction(interaction);
	}
};

async function handleChatInputCommand(interaction) {
	const command = interaction.client.commands.get(interaction.commandName); // The client instance provided by interaction is the same as the client defined earlier
	if(!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try { // TODO Fix  this /used to have awaits
		await command.execute(interaction);
	} catch(error) {
		console.error(error);
		if(interaction.replied || interaction.deferred) {
			interaction.followUp({content: "There was an error while executing this command!", ephemeral: true});
		} else {
			interaction.reply({content: 'There was an error while executing this command!', ephemeral: true});
		}
	}
}

async function handleButtonInteraction(interaction) {
	if(interaction.customId === "search") {
		search(interaction);
		return;
	}
	
	if(interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
		if(interaction.customId === "next") {
			turnPage(interaction, true);
			return;
		}
		else if(interaction.customId === "previous") {
			turnPage(interaction, false);
			return;
		}
	} else {
		await interaction.deferUpdate();
		interaction.reply({
			ephemeral: true,
			embeds: [
				new EmbedBuilder()
					.setAuthor({name: "Something went wrong!", iconURL: process.env.EXTREME_DEMON_URL})
					.setDescription("That function is **admin-only**!\nIf you believe this is **incorrect**, please contact _**@gamingpharoah**_")
					.setColor(process.env.FAIL_COLOR)
			]
		});
	}
}