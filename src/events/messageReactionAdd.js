require("dotenv").config();
const {Events, time, TimestampStyles} = require("discord.js");
const getTagByEmojiCode = require("../utility/discord/getTagByEmojiCode");
const createThreadAndReact = require("../utility/discord/createThreadAndReact");
const getVideosFromMessage = require("../utility/discord/getVideosFromMessage");
const createReactedThreadsFromVideos = require("../utility/discord/createReactedThreadsFromVideos");
const Judge = require("../mongo/Judge");
const Submission = require("../mongo/Submission");
const handleVetoJudgement = require("../utility/discord/handleVetoJudgement");

module.exports = {
	name: Events.MessageReactionAdd,
	execute(messageReaction, user) { // TODO: Some kind of caching issue here
		if(messageReaction.partial) messageReaction.fetch().then(reaction => handleIntactReaction(reaction, user));
		else handleIntactReaction(messageReaction, user);
	}
};

async function handleIntactReaction(messageReaction, user) {
	if(user.id === process.env.CLIENT_ID) return; // Seemed caching issue with .me so we use this instead
	const forumChannel = messageReaction.message.channel.parent;
	if(!forumChannel) return;

	const reactionChannel = messageReaction.message.channel;
	if(forumChannel.id === process.env.SUBMISSIONS_FORUM_ID) await handleSubmissionResponse(messageReaction, reactionChannel);
	else if(forumChannel.id === process.env.VETO_FORUM_ID) handleVetoResponse(messageReaction, reactionChannel);
	
	Judge.enqueue(() => Judge.updateOne({userId: user.id}, {$pull: {unjudgedThreadIds: reactionChannel.id}}));
}

async function handleSubmissionResponse(messageReaction, reactionChannel) {
	const tags = reactionChannel.parent.availableTags;

	if(messageReaction.emoji.name === "⛔") handleSubmissionDeny(reactionChannel, tags);
	else if(messageReaction.emoji.name === "✅") await handleSubmissionApprove(reactionChannel, tags, messageReaction);
}

function handleSubmissionDeny(reactionChannel, tags) {
	const deniedTag = getTagByEmojiCode(tags, "⛔");
	reactionChannel.setAppliedTags([deniedTag.id]);
}

async function handleSubmissionApprove(reactionChannel, tags, messageReaction) {
	const vetoForum = await messageReaction.client.channels.fetch(process.env.VETO_FORUM_ID);
	const newThread = (await createReactedThreadsFromVideos(getVideosFromMessage(messageReaction.message), vetoForum))[0];

	Submission.enqueue(() => Submission.updateOne({threadId: reactionChannel.id}, {threadId: newThread.id}));

	const approvedTag = getTagByEmojiCode(tags, "✅");
	reactionChannel.setAppliedTags([approvedTag.id]);
}

function handleVetoResponse(messageReaction, reactionChannel) {
	const judgementEmojis = process.env.JUDGEMENT_EMOJIS.split(", ");
	if(!judgementEmojis.includes(messageReaction.emoji.name)) return;
	
	const tags = reactionChannel.parent.availableTags;
	const pendingTagId = getTagByEmojiCode(tags, "‼️").id; // Used later
	const targetTagIds = [
		pendingTagId,
		getTagByEmojiCode(tags, "✅").id,
		getTagByEmojiCode(tags, "⛔").id
	];
	if(reactionChannel.appliedTags.some(appliedTag => targetTagIds.includes(appliedTag))) return; // We know that pending threads only change after a set amount of time, not after a certain nujmber of emojis

	let count = 0;
	count += messageReaction.count;
	
	if(count < process.env.VETO_THRESHOLD + 2) { // + 2 to account for the bot's reactions
		const otherEmoji = judgementEmojis[(judgementEmojis.findIndex(element => element === messageReaction.emoji.name) + 1) % judgementEmojis.length];
		const otherReaction = messageReaction.message.reactions.resolve(otherEmoji);
		count += otherReaction.count;
		if(count < +process.env.VETO_THRESHOLD + 2) return;
	}
	
	handleVetoPending(reactionChannel, pendingTagId, messageReaction);
}

async function handleVetoPending(reactionChannel, pendingTagId, messageReaction) {
	const expirationTime = new Date().valueOf() + (+process.env.PENDING_DURATION);
	Submission.enqueue(() => Submission.updateOne({threadId: reactionChannel.id}, {expirationTime: expirationTime}));
	
	reactionChannel.setAppliedTags([pendingTagId]);
	
	const expirationDate = new Date(expirationTime); // 1 week in the future
	messageReaction.message.edit(`‼️ **Last Chance!** Pending Status expires ${time(expirationDate, TimestampStyles.RelativeTime)}\n\n${messageReaction.message.content}...`);

	setTimeout(() => handleVetoJudgement(messageReaction.client, reactionChannel.id), +process.env.PENDING_DURATION);
}

