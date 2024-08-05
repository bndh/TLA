module.exports = async (forum) => {	
	const initialThreadContainer = await forum.threads.fetchArchived({fetchAll: true, limit: 2}); // Requires 2 or more but we need to specify archived so we are forced to use this
	const initialThread = initialThreadContainer.threads.size === 1 ? initialPoll.at(0) : null;
	if(!initialThread) return [];

	const archivedThreads = [initialThread];

	let hasMore = true;
	while(hasMore === true) {
		const fetchedThreadsContainer = await forum.threads.fetchArchived({fetchAll: true, before: archivedThreads[archivedThreads.length - 1].id});
		const fetchedThreads = fetchedThreadsContainer.threads;
		fetchedThreads.forEach(thread => archivedThreads.push(thread));
	}

	return archivedThreads;
}