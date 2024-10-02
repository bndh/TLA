const addReactions = require("../reactions/addReactions");

module.exports = async (forumChannel, guildForumThreadCreateOptions) => {
	const thread = await forumChannel.threads.create(guildForumThreadCreateOptions);
	const starterMessage = await thread.fetchStarterMessage();
	await addReactions(starterMessage);
	return thread;
}