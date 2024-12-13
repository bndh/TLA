const getActiveThreads = require("./getActiveThreads");
const getArchivedThreads = require("./getArchivedThreads");

module.exports = async (targetForum) => {
	const threads = await Promise.all([
		getActiveThreads(targetForum), 
		getArchivedThreads(targetForum)
	]);

	return threads[0].concat(threads[1]);
}


