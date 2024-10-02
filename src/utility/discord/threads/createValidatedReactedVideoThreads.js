require("dotenv").config();

const { Submission } = require("../../../mongo/mongoModels").modelData;

const createThreadAndReact = require("./createThreadAndReact");
const getTagByEmojiCode = require("./getTagByEmojiCode");
const submissionLinkExists = require("../../submissionLinkExists");

module.exports = async (videoLinks, forum) => {
	const status = forum.id === process.env.SUBMISSIONS_FORUM_ID ? "AWAITING DECISION" : "AWAITING VETO";

	for(const videoLink of videoLinks) {
		if(await submissionLinkExists(videoLink)) continue;
	
		const waitingTag = getTagByEmojiCode(forum, "⚖️");
		const videoTitle = await getVideoTitle(videoLink);
		const thread = await createThreadAndReact(
			forum, 
			{name: videoTitle ?? "New Submission!", message: videoLink, appliedTags: [waitingTag.id]}
		);

		const submissionCreateData = {
			threadId: thread.id, 
			videoLink: videoLink,
			status: status
		};
		if(videoTitle) submissionCreateData.videoTitle = videoTitle;
		Submission.enqueue(() => Submission.create(submissionCreateData)); // Enqueue will ensure that this happens in order
	}
}