const mongoose = require("mongoose");
const addModelExecutor = require("./utility/addModelExecutor");

const submissionSchema = new mongoose.Schema({
	threadId: {
		type      : String,
		required  : true,
		min       : 0
	},
	videoLink: {
		type      : String,
		required  : true
	},
	status: { // AWAITING DECISION -> DENIED / AWAITING VETO . PENDING APPROVAL -> VETOED / APPROVED
		type: String,
		required  : true,
		uppercase : true
	},
	expirationTime: {
		type      : Number,
		required  : false,
		min       : 0
	}
});

const model = mongoose.model("Submission", submissionSchema);
addModelExecutor(model);

module.exports = mongoose.model("Submission", submissionSchema); // Compiling the schema into a model. The database looks for the plural of this model name