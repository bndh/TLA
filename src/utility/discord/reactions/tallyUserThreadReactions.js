const hasReacted = require("./hasReacted");
const getAllThreads = require("../threads/getAllThreads");

module.exports = async (forum, userId, reactionCodes, checkForReactionAbsence = false, tagIdsToAvoid = []) => {
	const threads = await getAllThreads(forum);
	
	const filteredThreads = [];
	for(const thread of threads.values()) {
		if(tagIdsToAvoid.includes(thread.appliedTags[0])) continue;

		const starterMessage = await thread.fetchStarterMessage();
		const reactedToThread = await hasReacted(starterMessage, userId, reactionCodes);

		const qualifies = checkForReactionAbsence ? !reactedToThread : reactedToThread;
		if(qualifies) filteredThreads.push(thread);
	}
		
	return filteredThreads;
};