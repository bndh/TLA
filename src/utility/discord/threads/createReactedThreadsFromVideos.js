require("dotenv").config();
const getVideoTitle = require("../../getVideoTitle");
const youtubeIdRegex = require("../../youtubeIdRegex");
const createThreadAndReact = require("./createThreadAndReact");
const getTagByEmojiCode = require("./getTagByEmojiCode");

module.exports = async (videoLinks, forum) => {
	const waitingTag = getTagByEmojiCode(forum, "⚖️");

	return Promise.all([videoLinks.map(async videoLink => {
		const videoTitle = await getVideoTitle(videoLink) ?? "New Submission!";
		return createThreadAndReact(
			forum,
			{name: videoTitle, message: videoLink, appliedTags: [waitingTag.id]}
		);
	})]);
};