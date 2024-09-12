require("dotenv").config();

const {time, TimestampStyles} = require("discord.js");

const Submission = require("../../../mongo/Submission");
const Judge = require("../../../mongo/Judge");

const getTagByEmojiCode = require("../threads/getTagByEmojiCode");
const getVideosFromMessage = require("../messages/getVideosFromMessage");

const judgementEmojiCodes = process.env.JUDGEMENT_EMOJI_CODES.split(", ");

module.exports = async (client, submissionThreadId) => { // Use ids as it will be a long time before we run this, at which point we will need to fetch for accuracy
	const submissionThread = await client.channels.fetch(submissionThreadId);
	const submissionMessage = await submissionThread.fetchStarterMessage({force: true}); // Force because reaction cache may be incorrect otherwise
	if(submissionThread.archived) await submissionThread.setArchived(false); // Archived threads cannot be edited

	const counts = tallyJudgementReactions(submissionMessage.reactions); // count -> emojiCode
	const decisionTag = getTagByEmojiCode(submissionThread.parent, counts[0][1]);
	submissionThread.setAppliedTags([decisionTag.id]);

	const date = new Date();
	const videoLink = getVideosFromMessage(submissionMessage);
	submissionMessage.edit(`🥳 **Judging Concluded** on ${time(date, TimestampStyles.LongDateTime)}!\n\n${videoLink[0]}`);

	const judgeDocuments = await Judge.enqueue(() => Judge.find({counselledSubmissionIds: submissionThreadId}));
	judgeDocuments.forEach(judgeDocument => {
		const submissionIndex = judgeDocument.counselledSubmissionIds.indexOf(submissionThreadId);
		judgeDocument.counselledSubmissionIds.splice(submissionIndex, 1);
		judgeDocument.totalSubmissionsClosed++;
	});
	Judge.enqueue(() => Judge.bulkSave(judgeDocuments));

	Judge.enqueue(() => Judge.updateMany(
		{counselledSubmissionIds: submissionThreadId},
		{$pull: {counselledSubmissionIds: submissionThreadId}, $inc: {"totalSubmissionsClosed": 1}}
	).exec());
	
	Submission.enqueue(() => Submission.updateOne({threadId: submissionThreadId}, {$set: {status: decisionTag.name}, $unset: {expirationTime: 1}}).exec());
}

function tallyJudgementReactions(reactionManager) {
	const counts = new Map();
	
	for(let i = 0; i < judgementEmojiCodes.length; i++) {
		const reaction = reactionManager.resolve(judgementEmojiCodes[i]);
		counts.set(reaction.count, judgementEmojiCodes[i]);
	}

	return [...counts.entries()].sort((a, b) => b[0] - a[0]); // Sorts in descending order
}