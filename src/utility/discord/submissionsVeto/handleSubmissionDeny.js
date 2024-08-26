const Submission = require("../../../mongo/Submission");
const Judge = require("../../../mongo/Judge");

const getTagByEmojiCode = require("../threads/getTagByEmojiCode");

module.exports = (submissionChannel) => {
	const deniedTag = getTagByEmojiCode(submissionChannel.parent, "⛔");
	submissionChannel.setAppliedTags([deniedTag.id]);
	Submission.enqueue(() => Submission.updateOne({threadId: submissionChannel.id, status: "DENIED"}).exec());
	Judge.enqueue(() => Judge.updateMany({judgeType: "admin"}, {$pull: {unjudgedThreadIds: submissionChannel.id}}).exec());
}