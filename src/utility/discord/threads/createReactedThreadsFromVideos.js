const createThreadAndReact = require("./createThreadAndReact");
const getTagByEmojiCode = require("./getTagByEmojiCode");

module.exports = async (videoLinks, targetForum) => {
	const waitingTag = getTagByEmojiCode(targetForum.availableTags, "⚖️");

	const videoPromises = []
	videoLinks.forEach(videoLink => videoPromises.push(createThreadAndReact(targetForum, {message: videoLink, appliedTags: [waitingTag.id]})));
	return Promise.all(videoPromises);
};