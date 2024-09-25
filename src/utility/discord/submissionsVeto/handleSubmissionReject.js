const { Submission } = require("../../../mongo/mongoModels").modelData;

const getTagByEmojiCode = require("../threads/getTagByEmojiCode");

module.exports = (submissionChannel) => {
	const deniedTag = getTagByEmojiCode(submissionChannel.parent, "⛔");
	submissionChannel.setAppliedTags([deniedTag.id]);
	Submission.enqueue(() => Submission.updateOne({threadId: submissionChannel.id}, {status: "REJECTED"}).exec());
}