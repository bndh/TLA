const {Events} = require("discord.js");
const { execute } = require("./ready");

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if(!interaction.isChatInputCommand()) return;

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
				await interaction.followUp({content: "There was an error executing this command!", ephemeral: true});
			} else {
				await interaction.reply({content: 'There was an error while executing this command!', ephemeral: true});
			}
		}
	}
};