const createThreadAndReact = require("./createThreadAndReact");
const getTagByEmojiCode = require("./getTagByEmojiCode");

module.exports = async (videoLinks, forum) => {
	const waitingTag = getTagByEmojiCode(forum, "⚖️");

	const videoThreadPromises = [];
	videoLinks.forEach(videoLink => videoThreadPromises.push(createThreadAndReact(forum, {message: videoLink, appliedTags: [waitingTag.id]})));
	return Promise.all(videoThreadPromises);
};