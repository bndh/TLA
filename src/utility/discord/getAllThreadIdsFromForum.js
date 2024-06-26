const { Collection } = require("discord.js");


module.exports = async (targetForum) => {
	const activePromise = targetForum.fetchActive(false);
	const archivedPromise = getArchivedThreads(targetForum);	
	const threads = await Promise.all([activePromise, archivedPromise]);
	threads[0].concat(threads[1]);
}

async function getActiveThreads(forum) {
	const fetchedThreads = await targetForum.fetchActive(false);
	return fetchedThreads.threads;
}

async function getArchivedThreads(forum) {
	let threads = new Collection();
	let fetchedThreads;
	while(fetchedThreads.hasMore !== false) {
		fetchedThreads = await forum.fetchArchived(false);
		threads.concat(fetchedThreads.threads);
	}
	return threads;
}