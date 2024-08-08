const Submission = require("../../../mongo/Submission");
const Judge = require("../../../mongo/Judge");

const getTagByEmojiCode = require("../threads/getTagByEmojiCode");

module.exports = (reactionChannel, tags) => {
	const deniedTag = getTagByEmojiCode(tags, "⛔");
	reactionChannel.setAppliedTags([deniedTag.id]);
	Submission.enqueue(() => Submission.updateOne({threadId: reactionChannel.id, status: "DENIED"}));
	Judge.enqueue(() => Judge.updateMany({judgeType: "admin"}, {$pull: {unjudgedThreadIds: reactionChannel.id}}));
}