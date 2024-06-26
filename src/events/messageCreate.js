require("dotenv").config();
const {Events, ForumChannel} = require("discord.js");

const addReactions = require("../utility/discord/addReactions");
const createThreadAndReact = require("../utility/discord/createThreadAndReact");
const getVideosFromMessage = require("../utility/discord/getVideosFromMessage");
const { create } = require("../mongo/Submission");
const createReactedThreadsFromVideos = require("../utility/discord/createReactedThreadsFromVideos");
const createValidatedReactedVideoThreads = require("../utility/discord/createValidatedReactedVideoThreads");

module.exports = {
	name: Events.MessageCreate,
	execute(message) {
		if(message.partial) message.fetch().then(message => handleMessage(message));
		else handleMessage(message);
	}
};

function handleMessage(message) {
	if(message.author.bot) return;
	if(message.channelId !== process.env.SUBMISSIONS_INTAKE_ID) return;

	message.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID)
		.then(submissionsForum => createValidatedReactedVideoThreads(getVideosFromMessage(message), submissionsForum));
}