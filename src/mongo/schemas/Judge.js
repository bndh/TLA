const mongoose = require("mongoose");

module.exports = new mongoose.Schema({
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