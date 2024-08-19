module.exports = (model) => {
	model.queue = [];
	model.running = false;

	model.enqueue = (query) => {
		let resolveQuery;
		const queryPromise = new Promise(function(resolve) {
			resolveQuery = resolve;
		});
		
		const queryFunction = async () => resolveQuery(await query());

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