module.exports = (model) => {
	model.queue = [];
	model.running = false;

	model.enqueue = (query) => {
		let resolveQuery;
		const queryPromise = new Promise(function(resolve) {
			resolveQuery = resolve; // Allows us to resolve this promise in the executor loop manually, allowing external code to be notified when the task is completed. Needs to be separate so we can return this immediately
		});
		
		const queryFunction = async () => resolveQuery(await query()); // Resolves the prior promise once its interior task completes

		model.queue.push(queryFunction);
		if(!model.running) model.runExecutor();
		
		return queryPromise;
	};

	model.runExecutor = async () => {
		model.running = true;
		while(model.queue.length > 0) {
			const queryFunction = model.queue.shift();
			await queryFunction();
		}
		model.running = false;
	};
}