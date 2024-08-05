module.exports = async (forum) => {
	const activeThreads = await forum.threads.fetchActive(false);
	return activeThreads.threads;
}
