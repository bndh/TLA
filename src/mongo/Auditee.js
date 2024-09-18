const mongoose = require("mongoose");

const auditeeSchema = new mongoose.Schema({ // Must store all data due to overwrite setting on /audit
	sizedUsername: {
		type      : String,
		required  : true,
		maxLength : 16 // Maxes correspond with the size of the field, any larger and they wont fit
	},
	judgeType: {
		type      : String,
		required  : true,
	},
	judgedInInterim: {
		type      : Number,
		required  : true,
		min       : 0,
		max       : 99999,
		validate  : {
			validator : Number.isInteger,
			message   : "{VALUE} is not an integer"
		}
	},
	interimChange: {
		type      : Number,
		required  : true,
		min       : -9999,
		max       : 99999
	},
	totalSubmissionsJudged: {
		type      : Number,
		required  : true,
		min       : 0,
		max       : 99999,
		validate  : {
			validator : Number.isInteger,
			message   : "{VALUE} is not an integer"
		}
	}
});

const model = mongoose.model("Auditee", auditeeSchema);
module.exports = model;