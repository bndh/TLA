require("dotenv").config();
const {Events} = require("discord.js");

module.exports = {
	name: Events.MessageCreate,
	execute(message) {
		if(message.author.bot) return;

		if(message.channelId === process.env.SUBMISSIONS_INTAKE_ID) {
			message.channel.send(`Message \`${message.content}\` sent at \`${message.createdTimestamp}\`.`);
		}
	}
};