require("dotenv").config();
const {Events} = require("discord.js");
const getVideosFromMessage = require("../utility/discord/messages/getVideosFromMessage");
const createValidatedReactedVideoThreads = require("../utility/discord/threads/createValidatedReactedVideoThreads");

module.exports = {
	name: Events.MessageCreate,
	execute(message) {
		if(message.partial) message.fetch().then(message => handleMessage(message));
		else handleMessage(message);
	}
};
// TODO add response embed for whether or not the submission is already in the system
async function handleMessage(message) {
	if(message.author.bot) return;
	if(message.channelId !== process.env.SUBMISSIONS_INTAKE_ID) return;
	//TODO crosspost from overture discord
	const submissionsForum = await message.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID);
	createValidatedReactedVideoThreads(getVideosFromMessage(message), submissionsForum);
}