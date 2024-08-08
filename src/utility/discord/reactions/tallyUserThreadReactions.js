const hasReacted = require("./hasReacted");
const getAllThreads = require("../threads/getAllThreads");

module.exports = async (forum, userId, reactions, checkForReactionAbsence = false, undesiredTagIds = []) => {
	const threads = await getAllThreads(forum);
	
	const filteredThreads = [];
	for(const thread of threads.values()) {
		if(undesiredTagIds.includes(thread.appliedTags[0])) continue;

		const starterMessage = await thread.fetchStarterMessage();
		const reactedToThread = await hasReacted(starterMessage, userId, reactions);

		const qualifies = checkForReactionAbsence ? !reactedToThread : reactedToThread;
		if(qualifies) filteredThreads.push(thread);
	}
		
	return filteredThreads;
};