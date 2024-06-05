require("dotenv").config();
const {REST, Routes} = require("discord.js");
const getLocalCommands = require("./utility/getLocalCommands");

const commands = [];
for(const command of getLocalCommands()) {
	if("data" in command && "execute" in command) {
		commands.push(command.data.toJSON());
	} else {
		console.warn(`The command "${command.data.name}" is missing a required "data" or "execute" property.`);
	}
}

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);
		const data = await rest.put(
			Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), // Change to Routes.applicationCommands(process.env.CLIEND_ID) for global commands
			{body: commands}
		);
		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch(error) {
		console.error(error);
	}
})(); // This pair of brackets runs this