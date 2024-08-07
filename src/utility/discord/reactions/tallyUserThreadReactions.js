const hasReacted = require("./hasReacted");
const getAllThreads = require("../threads/getAllThreads");

module.exports = async (forum, userId, reactions, checkForReactionAbsence = false) => {
	const threads = await getAllThreads(forum); // Combine into one array

	const filteredThreads = [];
	threads.each(async thread => {
		const starterMessage = await thread.fetchStarterMessage();
		const reactedToThread = await hasReacted(starterMessage, userId, reactions);
		const qualifies = checkForReactionAbsence ? !reactedToThread : reactedToThread;
		if(qualifies) filteredThreads.push(thread);
	});
		
	return filteredThreads;
};