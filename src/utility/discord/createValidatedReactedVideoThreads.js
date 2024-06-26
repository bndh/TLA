
const Submission = require("../../mongo/Submission");
const createThreadAndReact = require("./createThreadAndReact");
const getTagByEmojiCode = require("./getTagByEmojiCode");

module.exports = async (videoLinks, forum) => {
	for(const videoLink of videoLinks) {
		const alreadyExists = await Submission.exists({videoLink: videoLink});
		if(alreadyExists) continue;
	
		const waitingTag = getTagByEmojiCode(forum.availableTags, "⚖️");
		const thread = await createThreadAndReact(forum, {message: videoLink, appliedTags: [waitingTag.id]});
		await Submission.create({threadId: thread.id, videoLink: videoLink}); // Must await to ensure that the entry is added to the database
	}
}