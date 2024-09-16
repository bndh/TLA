require("dotenv").config();

const {Events} = require("discord.js");

const Judge = require("../mongo/Judge");

const getTagByEmojiCode = require("../utility/discord/threads/getTagByEmojiCode");
const handleSubmissionReject = require("../utility/discord/submissionsVeto/handleSubmissionReject");
const handleSubmissionApprove = require("../utility/discord/submissionsVeto/handleSubmissionApprove");
const handleVetoPending = require("../utility/discord/submissionsVeto/handleVetoPending");

const judgementEmojiCodes = process.env.JUDGEMENT_EMOJI_CODES.split(", ");
const openEmojiCodes = process.env.OPEN_EMOJI_CODES.split(", ");

module.exports = {
	name: Events.MessageReactionAdd,
	execute(messageReaction, user) { // TODO: Some kind of caching issue here
		if(messageReaction.partial) messageReaction.fetch().then(reaction => handleIntactReaction(reaction, user));
		else handleIntactReaction(messageReaction, user);
	}
};

async function handleIntactReaction(messageReaction, user) {
	if(user.id === process.env.CLIENT_ID) return; // TODO: Seemed caching issue with .me so we use this instead
	const forum = messageReaction.message.channel.parent;
	if(!forum) return;
	if(![process.env.VETO_FORUM_ID, process.env.SUBMISSIONS_FORUM_ID].includes(forum.id)) return;

	const submissionThread = messageReaction.message.channel;
	if(forum.id === process.env.SUBMISSIONS_FORUM_ID) await handleSubmissionResponse(messageReaction, submissionThread);
	else if(forum.id === process.env.VETO_FORUM_ID) handleVetoResponse(messageReaction, submissionThread, user);
}

async function handleSubmissionResponse(messageReaction, submissionThread) {
	if(messageReaction.emoji.name === judgementEmojiCodes[0]) await handleSubmissionApprove(submissionThread, messageReaction.message);
	else if(messageReaction.emoji.name === judgementEmojiCodes[1]) handleSubmissionReject(submissionThread);
}

function handleVetoResponse(messageReaction, submissionThread, judge) {
	if(!judgementEmojiCodes.includes(messageReaction.emoji.name)) return;

	const forum = submissionThread.parent;
	
	const closedTagIds = judgementEmojiCodes.map(emojiCode => getTagByEmojiCode(forum, emojiCode).id);
	if(submissionThread.appliedTags.some(appliedTagId => closedTagIds.includes(appliedTagId))) return; // Indicates that the submission is closed and any additional reaction would not have an effect

	Judge.enqueue(() => Judge.updateOne({userId: judge.id}, {$push: {counselledSubmissionIds: submissionThread.id}}));

	const pendingTagId = getTagByEmojiCode(forum, openEmojiCodes[1]).id; 
	if(submissionThread.appliedTags.some(appliedTagId => appliedTagId === pendingTagId)) return; // Indicates that the thread is pending, which this reaction should not affect for they close after a set amount of time

	if(meetsReactionThreshold(messageReaction, messageReaction.message)) {
		handleVetoPending(submissionThread, pendingTagId, messageReaction.message);
	}
}

function meetsReactionThreshold(messageReaction, message) {
	let count = messageReaction.count;

	if(count >= +process.env.VETO_THRESHOLD + 2) return true; // + 2 to account for the bot's reactions

	const emojiCodeIndex = judgementEmojiCodes.findIndex(element => element === messageReaction.emoji.name);
	const otherEmojiCode = judgementEmojiCodes[(emojiCodeIndex + 1) % judgementEmojiCodes.length]; // Increment to find the other judgement emoji
	const otherReaction = message.reactions.resolve(otherEmojiCode);
	count += otherReaction.count;

	if(count >= +process.env.VETO_THRESHOLD + 2) return true;
	else return false;
}
