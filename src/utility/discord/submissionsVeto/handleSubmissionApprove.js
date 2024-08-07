const Submission = require("../../../mongo/Submission");
const getVideosFromMessage = require("../messages/getVideosFromMessage");
const createReactedThreadsFromVideos = require("../threads/createReactedThreadsFromVideos");
const getTagByEmojiCode = require("../threads/getTagByEmojiCode");

module.exports = async (reactionChannel, tags, message) => {
	const vetoForum = await message.client.channels.fetch(process.env.VETO_FORUM_ID);
	const newThread = (await createReactedThreadsFromVideos(getVideosFromMessage(message), vetoForum))[0];

	Submission.enqueue(() => Submission.updateOne({threadId: reactionChannel.id}, {threadId: newThread.id, status: "AWAITING VETO"}));
	
	const approvedTag = getTagByEmojiCode(tags, "✅");
	reactionChannel.setAppliedTags([approvedTag.id]);
}