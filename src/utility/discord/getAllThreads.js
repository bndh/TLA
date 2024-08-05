const getActiveThreads = require("./getActiveThreads");
const getArchivedThreads = require("./getArchivedThreads");

module.exports = async (targetForum) => {
	const activePromise = await getActiveThreads(targetForum);
	const archivedPromise = await getArchivedThreads(targetForum);	
	const threads = await Promise.all([activePromise, archivedPromise]);
	return threads[0].concat(threads[1]);
}


