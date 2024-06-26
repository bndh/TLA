const addReactions = require("./addReactions");

module.exports = async (forumChannel, guildForumThreadCreateOptions) => {
	guildForumThreadCreateOptions.name = "New Submission!";
	const thread = await forumChannel.threads.create(guildForumThreadCreateOptions);
	const starterMessage = await thread.fetchStarterMessage();
	await addReactions(starterMessage);
	return thread;
}