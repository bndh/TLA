const fs = require("fs");
const path = require("path");

module.exports = (directory, filter = undefined) => {
	let filepaths = [];

	for(const file of fs.readdirSync(directory, {withFileTypes: true})) {
		const filepath = path.join(directory, file.name);
		if(filter && filter(filepath)) {
			filepaths.push(filepath);
		} else {
			filepaths.push(filepath);
		}
	}
	return filepaths;
};