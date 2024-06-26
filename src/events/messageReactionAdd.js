require("dotenv").config();
const {Events} = require("discord.js");
const getTagByEmojiCode = require("../utility/discord/getTagByEmojiCode");
const createThreadAndReact = require("../utility/discord/createThreadAndReact");
const getVideosFromMessage = require("../utility/discord/getVideosFromMessage");
const createReactedThreadsFromVideos = require("../utility/discord/createReactedThreadsFromVideos");

module.exports = {
	name: Events.MessageReactionAdd,
	execute(messageReaction, user) { // TODO: Some kind of caching issue here
		if(messageReaction.partial) messageReaction.fetch().then(reaction => handleIntactReaction(reaction));
		else handleIntactReaction(messageReaction);
	}
};

function handleIntactReaction(messageReaction) {
	if(messageReaction.me === true) return;
	const forumChannel = messageReaction.message.channel.parent;
	if(!forumChannel) return;

	if(forumChannel.id === process.env.SUBMISSIONS_FORUM_ID) handleSubmissionResponse(messageReaction);
	else if(forumChannel.id === process.env.VETO_FORUM_ID) handleVetoResponse(messageReaction);		
}

function handleSubmissionResponse(messageReaction) {
	const reactionChannel = messageReaction.message.channel;
	const tags = messageReaction.message.channel.parent.availableTags;

	if(messageReaction.emoji.name === "⛔") handleSubmissionDeny(reactionChannel, tags);
	else if(messageReaction.emoji.name === "✅") handleSubmissionApprove(reactionChannel, tags, messageReaction);
}

function handleSubmissionDeny(reactionChannel, tags) {
	const deniedTag = getTagByEmojiCode(tags, "⛔");
	reactionChannel.setAppliedTags([deniedTag.id]);
}

function handleSubmissionApprove(reactionChannel, tags, messageReaction) {
	messageReaction.client.channels.fetch(process.env.VETO_FORUM_ID)
		.then(vetoForum => createReactedThreadsFromVideos(getVideosFromMessage(messageReaction.message), vetoForum))
		.then(() => {
			const approvedTag = getTagByEmojiCode(tags, "✅");
			reactionChannel.setAppliedTags([approvedTag.id]);
		});
}


function handleVetoResponse(messageReaction) {
	console.log("not cool man");
}