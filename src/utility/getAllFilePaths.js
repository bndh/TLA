const fs = require("fs");
const path = require("path");

module.exports = (directory, foldersOnly = false) => {
	let filePaths = [];

	const files = fs.readdirSync(directory, {withFileTypes: true});
	for(const file of files) {
		const filePath = path.join(directory, file.name);

		if(foldersOnly) {
			if(file.isDirectory()) {
				filePaths.push(filePath);
			}
		} else {
			if(filePath.endsWith("js")) {
				filePaths.push(filePath);
			}
		}
	}

	return filePaths;
};