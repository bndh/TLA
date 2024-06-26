const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
	threadId: {
		type: String,
		required: true,
		min: 0
	},
	videoLink: {
		type: String,
		required: true,
		lowercase: true
	}
});

module.exports = mongoose.model("Submission", submissionSchema); // Compiling the schema into a model. The database looks for the plural of this model name