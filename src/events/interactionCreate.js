const {Collection, Events, PermissionFlagsBits, EmbedBuilder} = require("discord.js");
const getAllExports = require("../utility/files/getAllExports");
const path = require("path");

let buttons = new Collection();
const buttonData = getAllExports(path.join(__dirname, "..", "utility/discord/buttons"), file => !file.name.toLowerCase().endsWith("modules"));
buttonData.forEach(button => buttons.set(button.customId, button));

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

	try {
		await command.execute(interaction);
	} catch(error) {
		console.error(error);
		if(interaction.replied || interaction.deferred) {
			interaction.editReply({embeds: [EmbedBuilder.generateFailEmbed()]});
		} else {
			interaction.reply({
				embeds: [EmbedBuilder.generateFailEmbed()], 
				ephemeral: true
			});
		}
	}
}
// TODO work on async
async function handleButtonInteraction(interaction) {
	const button = buttons.get(interaction.customId);
	if(!button) interaction.reply({
		ephemeral: true,
		embeds: [EmbedBuilder.generateFailEmbed()]
	});

	if(interaction.memberPermissions === undefined || interaction.memberPermissions.has(button.permissionBits)) {
		try {
			await button.execute(interaction);
		} catch(error) {
			console.error(error);
			
			const errorEmbed = EmbedBuilder.generateFailEmbed();
			if(interaction.replied || interaction.deferred) {
				interaction.editReply({embeds: [errorEmbed]});
			} else {
				interaction.reply({embeds: [errorEmbed], ephemeral: true});
			}
		}
	} else {
		const permissionErrorEmbed = EmbedBuilder.generateFailEmbed("**Insufficient permissions**!\nIf you believe this is **incorrect**, please contact _**@gamingpharoah**_.");
		if(interaction.replied || interaction.deferred) {
			interaction.editReply({embeds: [permissionErrorEmbed]});
		} else {
			interaction.reply({embeds: [permissionErrorEmbed], ephemeral: true});
		}
	}
} // TODO test composite permissions