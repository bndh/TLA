const mongoose = require("mongoose");

const judgeSchema = new mongoose.Schema({
	userId: {
		type: String,
		required: true
	},
	judgeType: {
		type: String,
		required: true
	},
	unjudgedThreadCount: {
		type: Number,
		required: true,
		min: 0
	}
});

const model = mongoose.model("Audit", judgeSchema);
module.exports = model;