const getActiveThreads = require("./getActiveThreads");
const getArchivedThreads = require("./getArchivedThreads");

module.exports = async (targetForum, autoUnarchive = false) => {
	const activePromise = await getActiveThreads(targetForum);
	const archivedPromise = await getArchivedThreads(targetForum);
	const threads = await Promise.all([activePromise, archivedPromise]);
	
	if(autoUnarchive) {
		await Promise.all(threads[1].map(thread => {
			if(thread.archived === true) return thread.setArchived(false);
		})); // Unarchive all archived threads because important information cannot be accessed when archived
	}

	return threads[0].concat(threads[1]);
}


