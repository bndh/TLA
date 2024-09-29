module.exports = (message, reactionCodes) => {
	return reactionCodes.reduce((emojiCode, total) => {
		total + message.reactions.resolve(emojiCode)?.count ?? 0;
	}, 0);
}