const mongoose = require("mongoose");

module.exports = new mongoose.Schema({
	id: {
		type     : String,
		required : true
	},
	data: {
		type     : String,
		required : true
	}
});

