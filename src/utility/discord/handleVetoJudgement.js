const getTagByEmojiCode = require("./getTagByEmojiCode");
const getVideosFromMessage = require("./getVideosFromMessage");
const {time, TimestampStyles, ThreadChannel} = require("discord.js");
const Submission = require("../../mongo/Submission");

require("dotenv").config();

module.exports = async (client, submissionChannelId) => { // Use ids as it may be a long time before we run this function
	const submissionChannel = await client.channels.fetch(submissionChannelId);
	const submissionMessage = await submissionChannel.fetchStarterMessage();

	if(submissionChannel.archived) {
		await submissionChannel.setArchived(false);
	}

	const counts = [];
	const reactionManager = submissionMessage.reactions;
	for(const emoji of process.env.JUDGEMENT_EMOJIS.split(", ")) {
		const count = reactionManager.resolve(emoji).count;
		counts.push({emoji: emoji, count: count});
	}
	const decisionEmoji = counts.sort((a, b) => b.count - a.count)[0].emoji;
	const decisionTag = getTagByEmojiCode(submissionChannel.parent.availableTags, decisionEmoji);
	submissionChannel.setAppliedTags([decisionTag.id]);

	const date = new Date();
	const videoLink = getVideosFromMessage(submissionMessage);
	submissionMessage.edit(`🥳 **Judging Concluded** on ${time(date, TimestampStyles.LongDateTime)}!\n\n${videoLink[0]}`);

	Submission.enqueue(() => Submission.updateOne({threadId: submissionChannelId}, {$unset: {expirationTime: 1}}));
}