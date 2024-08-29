const mongoose = require("mongoose");
const addModelExecutor = require("./utility/addModelExecutor");

const judgeSchema = new mongoose.Schema({
	userId: {
		type: String,
		required: true
	},
	judgeType: {
		type: String,
		required: true
	},
	unjudgedThreadIds: {
		type: [String],
		required: true
	},
	snapshotIntervalJudged: { // Number of submissions judged between last snapshot and the penultimate snapshot 
		type: Number,
		required: false
	},
	snapshotTotalUnjudged: { // Total number of submissions judged at last snapshot
		type: Number,
		required: false
	}
});

const model = mongoose.model("Judge", judgeSchema); // Compiling the schema into a model. Looks for a table named after the plural of the model name
addModelExecutor(model);

module.exports = model;