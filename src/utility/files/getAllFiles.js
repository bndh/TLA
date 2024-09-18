const fs = require("fs");

module.exports = (directory, filter = undefined) => {
	let files = [];

	for(const file of fs.readdirSync(directory, {withFileTypes: true})) {
		if(filter && filter(file)) {
			files.push(file);
		} else {
			files.push(file);
		}
	}
	return files;
};