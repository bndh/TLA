const getActiveThreads = require("./getActiveThreads");
const getArchivedThreads = require("./getArchivedThreads");

module.exports = async (targetForum, autoUnarchive = false) => {
	const threads = await Promise.all([
		getActiveThreads(targetForum), 
		getArchivedThreads(targetForum)
	]);
	
	if(autoUnarchive) {
		await Promise.all(threads[1].map(thread => {
			if(thread.archived === true) return thread.setArchived(false);
		})); // Unarchive all archived threads because important information cannot be accessed when archived
	}

	return threads[0].concat(threads[1]);
}


