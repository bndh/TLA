module.exports = (forum, emojiCodes, ordered = false) => {
	const filteredTags = forum.availableTags.filter(tag => emojiCodes.includes(tag.emoji.name));
	if(ordered) { // Need ordered step as availableTags order may not correspond with inputted tagNames order
		const emojiCodeIndexMap = new Map([emojiCodes.map((name, index) => [name, index])]);
		filteredTags.sort((nameA, nameB) => emojiCodeIndexMap.get(nameA) - emojiCodeIndexMap.get(nameB));
	}
	return filteredTags;
}