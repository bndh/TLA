const mongoose = require("mongoose");
const getAllExports = require("../utility/files/getAllExports");
const path = require("path");
const getAllFiles = require("../utility/files/getAllFiles");

module.exports = {
	modelData: ({}),
	setup() {
		const plugins = getAllExports(path.join(__dirname, "plugins"));
		for(const plugin of plugins) {
			mongoose.plugin(plugin);
		}

		const schemaDirectory = path.join(__dirname, "schemas");
		const schemaFiles = getAllFiles(schemaDirectory);
		for(const schemaFile of schemaFiles) {
			const schema = require(path.join(schemaDirectory, schemaFile.name));
			const schemaName = schemaFile.name.slice(0, -3); // Removes .js suffix

			const model = mongoose.model(schemaName, schema);
			this.modelData[schemaName] = model;
		}
	}
};