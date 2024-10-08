require("dotenv").config();
const {Events, EmbedBuilder} = require("discord.js");

const { Submission } = require("../mongo/mongoModels").modelData;

const getVideosFromMessage = require("../utility/discord/messages/getVideosFromMessage");
const createValidatedReactedVideoThreads = require("../utility/discord/threads/createValidatedReactedVideoThreads");
const submissionLinkExists = require("../utility/submissionLinkExists");
const createThreadAndReact = require("../utility/discord/threads/createThreadAndReact");
const getTagByEmojiCode = require("../utility/discord/threads/getTagByEmojiCode");

const OPEN_EMOJI_CODES = process.env.OPEN_EMOJI_CODES.split(", ");

module.exports = {
	name: Events.MessageCreate,
	execute(message) {
		if(message.author.id === process.env.CLIENT_ID) return;

		if(message.partial) message.fetch().then(message => handleMessage(message));
		else handleMessage(message);
	}
};

async function handleMessage(message) {
	if(message.channelId !== process.env.SUBMISSIONS_INTAKE_ID) return;

	const submissionsForum = await message.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID);
	const waitingTag = getTagByEmojiCode(submissionsForum, OPEN_EMOJI_CODES[0]);

	const videoLinks = getVideosFromMessage(message);
	
	const preExistingVideoLinks = [];
	const existencePromises = Array(videoLinks.length);
	for(let i = 0; i < videoLinks.length; i++) {
		existencePromises[i] = new Promise(async resolve => {
			const preExisting = await submissionLinkExists(videoLinks[i]);
			if(!preExisting) await handleNewThread(submissionsForum, waitingTag, videoLinks[i]);
			else preExistingVideoLinks.push(videoLinks[i]);
			resolve();
		});
	}
	
	await Promise.all(existencePromises);
	if(preExistingVideoLinks.length >= 1) {
		const responseTextModules = Array(2);
		if(preExistingVideoLinks.length !== 1) {
			responseTextModules[0] = "s";
			responseTextModules[1] = "they **already exist";
		} else {
			responseTextModules[0] = "";
			responseTextModules[1] = "it **already exists";
		}

		const responseText = `Did **not forward** the following **video${responseTextModules[0]}** as ${responseTextModules[1]}**:\n\n` + 
							 preExistingVideoLinks.reduce(
								(accumulator, video) => accumulator + video + "\n",
								""
							);

		message.reply({embeds: [EmbedBuilder.generateFailEmbed(responseText)]});
	}
}

async function handleNewThread(submissionsForum, waitingTag, videoLink) {
	const thread = await createThreadAndReact(submissionsForum, {message: videoLink, appliedTags: [waitingTag.id]});

	await Submission.enqueue(() => Submission.create({
		threadId: thread.id,
		videoLink: videoLink,
		status: "AWAITING DECISION"
	}));
}