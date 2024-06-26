const mongoose = require("mongoose");

const nominatorSchema = new mongoose.Schema({
	userId: {
		type: String,
		required: true
	},
	unjudgedLayoutVetoIds: {
		type: [String],
		required: true
	}
});
module.exports = mongoose.model("Nominator", nominatorSchema); // Compiling the schema into a model. The database looks for the plural of this model name