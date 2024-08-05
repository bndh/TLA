module.exports = (model) => {
	model.queue = [];
	model.running = false;

	model.enqueue = (query) => {
		let resolveQuery;
		const queryPromise = new Promise(function(resolve) {
			resolveQuery = resolve;
		});
		const queryContainer = {
			async execute() {
				const queryResult = await query();
				resolveQuery(queryResult);
			}
		};
		
		model.queue.push(queryContainer);
		if(!model.running) model.execute();
		
		return queryPromise;
	};
	model.execute = async () => {
		model.running = true;
		while(model.queue.length > 0) {
			const queryContainer = model.queue.shift();
			await queryContainer.execute();
		}
		model.running = false;
	};
}