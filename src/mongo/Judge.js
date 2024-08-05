const mongoose = require("mongoose");
const addModelExecutor = require("./utility/addModelExecutor");

const nominatorSchema = new mongoose.Schema({
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
	}
});

const model = mongoose.model("Judge", nominatorSchema); // Compiling the schema into a model. Looks for a table named after the plural of the model name
addModelExecutor(model);

module.exports = model;