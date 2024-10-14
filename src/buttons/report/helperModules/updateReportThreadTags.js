const calibrateButtonRow = require("../../../utility/discord/messages/calibrateButtonRow");

module.exports = async (thread, status) => {
	const forum = thread.parent;

	const categoryTagId = thread.appliedTags.find(tagId => {
		const tag = forum.availableTags.find(tag => tag.id === tagId);
		if(tag.name === "Suggestion" || tag.name === "Issue") return true;
	});
	const statusTag = forum.availableTags.find(tag => tag.name.toLowerCase().match(status)); // Necessary to use match as status "closed" does not match button id "close"
		
	return thread.setAppliedTags([categoryTagId, statusTag.id]);
}