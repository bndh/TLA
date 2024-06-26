module.exports = (tags, emojiCode) => {
	for(const tag of tags) {
		if(tag.emoji.name === emojiCode) return tag;
	}
};