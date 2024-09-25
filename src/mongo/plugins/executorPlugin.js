const { model } = require("mongoose");

module.exports = function(schema, options) { // Cannot use arrow functions here
	schema.statics.queue = [];
	schema.statics.running = false;
	
	schema.statics.enqueue = async function(query) {
		let resolveQuery;
		const queryPromise = new Promise((resolve) => {
			resolveQuery = resolve; // Allows promise resolution anywhere that has access to the method
		});

		const executeQueryAndNotify = async () => {
			const queryResult = await query();
			resolveQuery(queryResult);
		};

		this.queue.push(executeQueryAndNotify);
		if(!this.running) this.runExecutor();

		return queryPromise;
	}

	schema.statics.runExecutor = async function() {
		this.running = true;
		
		while(this.queue.length > 0) {
			const executeQueryAndNotify = this.queue.shift();
			await executeQueryAndNotify();
		}
		this.running = false;
	};
}