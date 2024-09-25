const mongoose = require("mongoose");

module.exports = new mongoose.Schema({
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