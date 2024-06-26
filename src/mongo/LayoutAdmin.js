const mongoose = require("mongoose");

const layoutAdminSchema = new mongoose.Schema({
	userId: {
		type: String,
		required: true
	},
	unjudgedLayoutSubmissionIds: {
		type: [String],
		required: true
	}
});
module.exports = mongoose.model("LayoutAdmin", layoutAdminSchema);