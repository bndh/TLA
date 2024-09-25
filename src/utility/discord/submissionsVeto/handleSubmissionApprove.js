const { Submission } = require("../../../mongo/mongoModels").modelData;

const getVideosFromMessage = require("../messages/getVideosFromMessage");
const createReactedThreadsFromVideos = require("../threads/createReactedThreadsFromVideos");
const getTagByEmojiCode = require("../threads/getTagByEmojiCode");

module.exports = async (submissionChannel, submissionMessage) => {
	const vetoForum = await submissionMessage.client.channels.fetch(process.env.VETO_FORUM_ID);
	const newThread = (await createReactedThreadsFromVideos(getVideosFromMessage(submissionMessage), vetoForum))[0];

	Submission.enqueue(() => Submission.updateOne({threadId: submissionChannel.id}, {threadId: newThread.id, status: "AWAITING VETO"}).exec());
	
	const approvedTag = getTagByEmojiCode(submissionChannel.parent, "✅");
	submissionChannel.setAppliedTags([approvedTag.id]);
}