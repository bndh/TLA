const { Collection } = require("discord.js");

module.exports = async (forum) => {
	let archive = await forum.threads.fetchArchived({fetchAll: true, limit: 2}); // Min 2, so limit 2; used as a bassline for the before parameter
	let threads = archive.threads;

	while(archive.hasMore === true) {
		archive = await getNextBatch(forum, threads);
		threads = threads.concat(archive.threads);
	}
	return threads;
};

async function getNextBatch(forum, lastArchiveThreads) {
	const lastThreadId = lastArchiveThreads.at(lastArchiveThreads.length - 1).id;
	return forum.threads.fetchArchived({fetchAll: true, before: lastThreadId});
}