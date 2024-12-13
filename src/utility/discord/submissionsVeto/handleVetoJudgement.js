require("dotenv").config();

const {time, TimestampStyles, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");

const { Judge, Submission } = require("../../../mongo/mongoModels").modelData;
const getTagByEmojiCode = require("../threads/getTagByEmojiCode");
const getVideosFromMessage = require("../messages/getVideosFromMessage");

const { data: overturnButton } = require("../../../buttons/overturn/overturn");

const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");

module.exports = async (client, submissionThreadId) => { // Use ids as it will be a long time before we run this, at which point we will need to fetch for accuracy
	const submissionThread = await client.channels.fetch(submissionThreadId);
	const submissionMessage = await submissionThread.fetchStarterMessage({force: true}); // Force because reaction cache may be incorrect otherwise

	await Promise.all([
		updateThread(submissionThread, submissionMessage),
		updateMessage(submissionMessage),
		Judge.enqueue(() => Judge.updateMany(
			{counselledSubmissionIds: submissionThreadId},
			{$pull: {counselledSubmissionIds: submissionThreadId}, $inc: {"totalSubmissionsClosed": 1}}
		).exec()),
		Submission.enqueue(() => Submission.updateOne({threadId: submissionThreadId}, {$set: {status: decisionTag.name}, $unset: {expirationTime: 1}}).exec())
	]);
	// await submissionThread.setArchived(true); // Close old threads
}

async function updateThread(thread, starterMessage) {
	const counts = tallyJudgementReactions(starterMessage.reactions); // count -> emojiCode
	const decisionTag = getTagByEmojiCode(thread.parent, counts[0][1]);
	
	await thread.setAppliedTags([decisionTag.id]);
}

async function updateMessage(starterMessage) {
	let messageEditOptions = {};

	const date = new Date();
	let editedMessageContent = `🥳 **Judging Concluded** on ${time(date, TimestampStyles.LongDateTime)}!`;
	if(counts[0][1] === JUDGEMENT_EMOJI_CODES[1]) { // Veto win
		editedMessageContent += "\n\n__*Veto Overturn Requests:*__\n**None**";

		const actionRow = new ActionRowBuilder();
		actionRow.addComponents(overturnButton);
		messageEditOptions.components = [actionRow];
	}
	const videoLink = getVideosFromMessage(starterMessage);
	editedMessageContent += `\n\n${videoLink}`;
	messageEditOptions.content = editedMessageContent;

	starterMessage.edit(messageEditOptions);
}

function tallyJudgementReactions(reactionManager) {
	const counts = new Map();
	
	for(let i = 0; i < JUDGEMENT_EMOJI_CODES.length; i++) {
		const reaction = reactionManager.resolve(JUDGEMENT_EMOJI_CODES[i]);
		counts.set(reaction.count, JUDGEMENT_EMOJI_CODES[i]);
	}

	return [...counts.entries()].sort((a, b) => b[0] - a[0]); // Sorts in descending order
}