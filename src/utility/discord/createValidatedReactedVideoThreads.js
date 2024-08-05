const Submission = require("../../mongo/Submission");
const createThreadAndReact = require("./createThreadAndReact");
const getTagByEmojiCode = require("./getTagByEmojiCode");
const Judge = require("../../mongo/Judge");

module.exports = async (videoLinks, forum) => {
	for(const videoLink of videoLinks) {
		const alreadyExists = await Submission.exists({videoLink: videoLink});
		if(alreadyExists) continue;
	
		const waitingTag = getTagByEmojiCode(forum.availableTags, "⚖️");
		const thread = await createThreadAndReact(forum, {message: videoLink, appliedTags: [waitingTag.id]});

		Submission.enqueue(() => Submission.create({threadId: thread.id, videoLink: videoLink})); // Must await to ensure that the entry is added to the database
		Judge.enqueue(() => Judge.updateMany({}, {$push: {unjudgedThreadIds: thread.id}}));
	}
}