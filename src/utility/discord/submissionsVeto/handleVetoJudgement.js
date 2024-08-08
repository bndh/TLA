require("dotenv").config();

const {time, TimestampStyles} = require("discord.js");

const Submission = require("../../../mongo/Submission");
const Judge = require("../../../mongo/Judge");

const getTagByEmojiCode = require("../threads/getTagByEmojiCode");
const getVideosFromMessage = require("../messages/getVideosFromMessage");

module.exports = async (client, submissionChannelId) => { // Use ids as it may be a long time before we run this function
	const submissionChannel = await client.channels.fetch(submissionChannelId);
	const submissionMessage = await submissionChannel.fetchStarterMessage({force: true}); // Otherwise reaction cache may be incorrect
	if(submissionChannel.archived) await submissionChannel.setArchived(false);

	const counts = [];
	const reactionManager = submissionMessage.reactions;

	for(const emojiCode of process.env.JUDGEMENT_EMOJIS.split(", ")) {
		let reaction = reactionManager.resolve(emojiCode);
		const count = reaction.count;
		counts.push({emojiCode: emojiCode, count: count});
	}
	const decisionEmojiCode = counts.sort((a, b) => b.count - a.count)[0].emojiCode;
	const decisionTag = getTagByEmojiCode(submissionChannel.parent.availableTags, decisionEmojiCode);
	submissionChannel.setAppliedTags([decisionTag.id]);

	const date = new Date();
	const videoLink = getVideosFromMessage(submissionMessage);
	submissionMessage.edit(`🥳 **Judging Concluded** on ${time(date, TimestampStyles.LongDateTime)}!\n\n${videoLink[0]}`);

	Judge.enqueue(() => Judge.updateMany({}, {$pull: {unjudgedThreadIds: submissionChannelId}}));
	Submission.enqueue(() => Submission.updateOne({threadId: submissionChannelId}, {$set: {status: decisionTag.name}, $unset: {expirationTime: 1}}));
}