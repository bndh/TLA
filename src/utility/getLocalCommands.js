const path = require("path");
const getAllFilePaths = require("./getAllFilePaths");

module.exports = () => {
	let localCommands = [];

	const commandCategories = getAllFilePaths(path.join(__dirname, "..", "commands"), true);
	for(const commandCategory of commandCategories) {
		const commandFilePaths = getAllFilePaths(commandCategory);
		for(const commandPath of commandFilePaths) {
			const command = require(commandPath);
			localCommands.push(command);
		}
	}
	
	return localCommands;
}