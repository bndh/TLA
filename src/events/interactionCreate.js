const {Events} = require("discord.js");

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if(interaction.isChatInputCommand()) handleChatInputCommand(interaction);
		if(interaction.isButton()) handleButtonInteraction(interaction);
	}
};

function handleChatInputCommand(interaction) {
	const command = interaction.client.commands.get(interaction.commandName); // The client instance provided by interaction is the same as the client defined earlier
	if(!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try { // TODO Fix  this /used to have awaits
		command.execute(interaction);
	} catch(error) {
		console.error(error);
		if(interaction.replied || interaction.deferred) {
			interaction.followUp({content: "There was an error while executing this command!", ephemeral: true});
		} else {
			interaction.reply({content: 'There was an error while executing this command!', ephemeral: true});
		}
	}
}

function handleButtonInteraction(interaction) {
	
}