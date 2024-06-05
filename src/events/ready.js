const {Events} = require("discord.js");

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.info(`Ready! Logged in as ${client.user.tag}.`);
	}
};