const mongoose = require("mongoose");
const addModelExecutor = require("./utility/addModelExecutor");

const judgeSchema = new mongoose.Schema({
	userId: {
		type     : String,
		required : true
	},
	judgeType: {
		type     : String,
		required : true
	},
	counselledSubmissionIds: {
		type     : [String]
	},
	totalSubmissionsClosed: { // Once a submission the judge has judged closes, it migrates here
		type     : Number,
		required : true,
		min      : 0
	},
	snappedJudgedInterim: {
		type     : Number,
		required : false,
		min      : 0
	},
	snappedJudgedTotal: {
		type     : Number,
		required : false,
		min      : 0
	}
});

const model = mongoose.model("Judge", judgeSchema); // Compiling the schema into a model. Looks for a table named after the plural of the model name
addModelExecutor(model);

module.exports = model;