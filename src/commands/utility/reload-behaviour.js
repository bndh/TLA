const {SlashCommandBuilder} = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("reload-behaviour")
		.setDescription("Reloads a command's behaviour.")
		.addStringOption(option => 
			option.setName("command")
				.setDescription("The command to reload.")
				.setRequired(true)
		),
	async execute(interaction) {
		const commandName = interaction.options.getString("command", true).toLowerCase();
		const command = interaction.client.commands.get(commandName); // Get the mentioned command from the client

		if(!command) {
			return interaction.reply({content: `There is no command with name \`${commandName}\`!`, ephemeral: true});
		}

		const commandPath = `./${command.data.name}.js`;
		delete require.cache[require.resolve(commandPath)]; // Require caches its data so we must first delete it from the cache
		
		try {
			const newCommand = require(commandPath);
			interaction.client.commands.set(newCommand.data.name, newCommand);
			await interaction.reply({content: `Command \`${newCommand.data.name}\` was reloaded!`,ephemeral: true});
		} catch(error) {
			console.error(error);
			await interaction.reply({content: `There was an error while reloading a command \`${command.data.name}\`:\n\`${error.message}\``, ephemeral: true});
		}

	}
}