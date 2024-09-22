require("dotenv").config();
const {REST, Routes} = require("discord.js");
const path = require("path");
const getAllExports = require("./utility/files/getAllExports");

const commands = [];
for(const command of getAllExports(path.join(__dirname, "commands"), file => !file.name.toLowerCase().endsWith("modules"))) {
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
		console.log(`Successfully refreshed ${data.length} application (/) commands.`);
	} catch(error) {
		console.error(error);
	}
})(); // This pair of brackets calls this, as it would with console.log() for example; the only difference is that this function is anonymous