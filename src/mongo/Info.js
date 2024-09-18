const mongoose = require("mongoose");
const addModelExecutor = require("./utility/addModelExecutor");

const infoSchema = new mongoose.Schema({
	id: {
		type     : String,
		required : true
	},
	data: {
		type     : String,
		required : true
	}
});

const model = mongoose.model("Info", infoSchema);
addModelExecutor(model);

module.exports = model;