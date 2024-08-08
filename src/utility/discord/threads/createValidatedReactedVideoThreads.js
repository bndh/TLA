require("dotenv").config();

const Submission = require("../../../mongo/Submission");
const Judge = require("../../../mongo/Judge");

const createThreadAndReact = require("./createThreadAndReact");
const getTagByEmojiCode = require("./getTagByEmojiCode");


module.exports = async (videoLinks, forum, judgeTypes) => {
	const status = forum.id === process.env.SUBMISSIONS_FORUM_ID ? "AWAITING DECISION" : "AWAITING VETO";

	for(const videoLink of videoLinks) {
		const alreadyExists = await Submission.enqueue(() => Submission.exists({videoLink: videoLink}));
		if(alreadyExists) continue;
	
		const waitingTag = getTagByEmojiCode(forum.availableTags, "⚖️");
		const thread = await createThreadAndReact(forum, {message: videoLink, appliedTags: [waitingTag.id]});

		Submission.enqueue(() => Submission.create({threadId: thread.id, videoLink: videoLink, status: status})); // Enqueue will ensure that this happens in order
		Judge.enqueue(() => Judge.updateMany({judgeType: {$in: judgeTypes}}, {$push: {unjudgedThreadIds: thread.id}}));
	}
}