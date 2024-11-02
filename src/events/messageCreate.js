require("dotenv").config();
const {Events, EmbedBuilder} = require("discord.js");

const { Submission } = require("../mongo/mongoModels").modelData;

const getVideosFromMessage = require("../utility/discord/messages/getVideosFromMessage");
const submissionLinkExists = require("../utility/submissionLinkExists");
const createThreadAndReact = require("../utility/discord/threads/createThreadAndReact");
const getTagByEmojiCode = require("../utility/discord/threads/getTagByEmojiCode");
const getVideoTitle = require ("../utility/getVideoTitle");

const OPEN_EMOJI_CODES = process.env.OPEN_EMOJI_CODES.split(", ");

module.exports = {
	name: Events.MessageCreate,
	execute(message) {
		if(message.author.id === process.env.CLIENT_ID) return;

		if(message.partial) message.fetch().then(message => handleMessage(message));
		else handleMessage(message);
	},
	handleNewThread
};

async function handleMessage(message) {
	if(message.channelId !== process.env.SUBMISSIONS_INTAKE_ID) return;

	const submissionsForum = await message.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID);
	const waitingTagId = getTagByEmojiCode(submissionsForum, OPEN_EMOJI_CODES[0]).id;

	const videoLinks = getVideosFromMessage(message);
	
	const preExistingVideoLinks = [];
	for(const videoLink of videoLinks) {
		const preExisting = await submissionLinkExists(videoLink);
		if(!preExisting) await handleNewThread(submissionsForum, waitingTagId, videoLink); // Must await or messages with multiple of the same video link would not get detected
		else preExistingVideoLinks.push(videoLink);
	}
	
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

async function handleNewThread(submissionsForum, waitingTagId, videoLink) {
	const videoTitle = await getVideoTitle(videoLink);
	const thread = await createThreadAndReact(
		submissionsForum, 
		{name: videoTitle ?? "New Submission!", message: videoLink, appliedTags: [waitingTagId]}
	);

	const submissionCreateData = {
		threadId: thread.id, 
		videoLink: videoLink,
		status: "AWAITING DECISION"
	};
	if(videoTitle) submissionCreateData.videoTitle = videoTitle;
	return Submission.enqueue(() => Submission.create(submissionCreateData));
}