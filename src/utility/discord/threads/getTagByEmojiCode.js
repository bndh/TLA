module.exports = (forum, emojiCode) => {
	for(const tag of forum.availableTags) {
		if(tag.emoji.name === emojiCode) return tag;
	}
};