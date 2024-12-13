module.exports = async (forum) => {	
	let archive = await forum.threads.fetchArchived({fetchAll: true, limit: 2}); // Initial pool
	if(archive.threads.size === 0) return [];

	const archivedThreads = [...archive.threads.values()];

	while((archive = await getNextBatch(forum, archivedThreads)).hasMore === true) {
		archive.threads.forEach(thread => archivedThreads.push(thread));
	}

	return archivedThreads;
}

async function getNextBatch(forum, archivedThreads) {
	const lastThreadId = archivedThreads[archivedThreads.length - 1].id;
	return forum.threads.fetchArchived({fetchAll: true, before: lastThreadId});
}