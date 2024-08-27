const mongoose = require("mongoose");

const infoSchema = new mongoose.Schema({
	id: {
		type: String,
		required: true
	},
	data: {
		type: String,
		required: true
	}
});

const model = mongoose.model("Info", infoSchema);
module.exports = model;