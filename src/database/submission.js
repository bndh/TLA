const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
	userId: {
		type: String,
		required: true
	},
	content: {
		type: String,
		required: true
	}
});
const Submission = mongoose.model("Submission", submissionSchema); // Compiling the schema into a model. The database looks for the plural of this model name

module.exports = Submission;