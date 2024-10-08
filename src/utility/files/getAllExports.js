const path = require("path");

const getAllFiles = require("./getAllFiles");

function getAllExports(directory, filter = undefined) { // Disconnected from module.exports so that we can use the function inside itself
	let exports = [];

	for(const file of getAllFiles(directory)) {
		if(filter && !filter(file)) continue;

		const filepath = path.join(directory, file.name);
		if(file.isDirectory()) {
			exports.push(...getAllExports(filepath, filter));
		} else if(file.name.endsWith(".js")) {
			exports.push(require(filepath));
		}
	}
	return exports;
}

module.exports = getAllExports;